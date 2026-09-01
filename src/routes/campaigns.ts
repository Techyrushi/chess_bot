import { Request, Response, NextFunction } from 'express';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  transitionCampaignStatus,
  queueCampaignMessages,
  getCampaignAnalytics,
  listCampaignMessages
} from '../services/campaigns';
import { startCampaign, pauseCampaign, resumeCampaign, cancelCampaign } from '../services/sender';
import { getContactsInList, getValidContactListIds } from '../services/contacts';
import { validateCampaignSendInput } from '../lib/validation';
import { listContactLists } from '../services/contacts';
import { listTemplates } from '../services/templates';
import { createAuditLog } from '../lib/audit';

export default async function handleCampaigns(req: any, res: Response, next: NextFunction) {
  try {
    const { method, path, params, body, query } = req;

    // GET /campaigns - Page
    if (method === 'GET' && path === '/campaigns') {
      const page = Number(query.page) || 1;
      const perPage = Number(query.perPage) || 20;
      const data = await listCampaigns({ page, perPage });
      return res.render('campaigns/index', {
        title: 'Campaigns',
        admin: req.admin,
        campaigns: data.campaigns,
        pagination: { page, perPage, total: data.total, pages: data.pages }
      });
    }

    // GET /campaigns/:id - Page
    if (method === 'GET' && path.match(/^\/campaigns\/[\w-]+$/)) {
      const campaign = await getCampaign(params.id);
      if (!campaign) {
        return res.status(404).render('404', { title: 'Campaign not found' });
      }
      const analytics = await getCampaignAnalytics(params.id);
      const messages = await listCampaignMessages(params.id, { page: 1, perPage: 50 });
      return res.render('campaigns/detail', {
        title: campaign.name || 'Campaign',
        admin: req.admin,
        campaign,
        analytics,
        messages
      });
    }

    // API: GET /api/campaigns
    if (method === 'GET' && path === '/api/campaigns') {
      const page = Number(query.page) || 1;
      const perPage = Number(query.perPage) || 20;
      const status = query.status;
      const data = await listCampaigns({ page, perPage, status });
      return res.json(data);
    }

    // API: POST /api/campaigns - Create
    if (method === 'POST' && path === '/api/campaigns') {
      const validated = validateCampaignSendInput(body);
      const campaign = await createCampaign({
        ...validated,
        createdBy: req.admin.id
      });

      await createAuditLog({
        adminId: req.admin.id,
        action: 'campaign_created',
        resourceType: 'campaign',
        resourceId: campaign.id,
        details: { campaign }
      });

      return res.status(201).json(campaign);
    }

    // API: GET /api/campaigns/:id
    if (method === 'GET' && path.match(/^\/api\/campaigns\/[\w-]+$/)) {
      const campaign = await getCampaign(params.id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }
      return res.json(campaign);
    }

    // API: PUT /api/campaigns/:id
    if (method === 'PUT' && path.match(/^\/api\/campaigns\/[\w-]+$/)) {
      const updated = await updateCampaign(params.id, body);
      if (!updated) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      await createAuditLog({
        adminId: req.admin.id,
        action: 'campaign_updated',
        resourceType: 'campaign',
        resourceId: updated.id,
        details: { campaign: updated }
      });

      return res.json(updated);
    }

    // API: POST /api/campaigns/:id/control - Start/Pause/Resume/Cancel
    if (method === 'POST' && path.match(/^\/api\/campaigns\/[\w-]+\/control$/)) {
      const { action, batchSize } = body;
      const campaign = await getCampaign(params.id);

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      let result = campaign;
      let actionLabel = '';

      if (action === 'start') {
        const success = await startCampaign(params.id, batchSize || 100);
        if (!success) {
          return res.status(400).json({ error: 'Failed to start campaign' });
        }
        const updated = await getCampaign(params.id);
        result = updated || campaign;
        actionLabel = 'Started';
      } else if (action === 'pause') {
        const success = await pauseCampaign(params.id);
        if (!success) {
          return res.status(400).json({ error: 'Failed to pause campaign' });
        }
        const updated = await getCampaign(params.id);
        result = updated || campaign;
        actionLabel = 'Paused';
      } else if (action === 'resume') {
        const success = await resumeCampaign(params.id);
        if (!success) {
          return res.status(400).json({ error: 'Failed to resume campaign' });
        }
        const updated = await getCampaign(params.id);
        result = updated || campaign;
        actionLabel = 'Resumed';
      } else if (action === 'cancel') {
        const success = await cancelCampaign(params.id);
        if (!success) {
          return res.status(400).json({ error: 'Failed to cancel campaign' });
        }
        const updated = await getCampaign(params.id);
        result = updated || campaign;
        actionLabel = 'Cancelled';
      } else {
        return res.status(400).json({ error: 'Invalid action' });
      }

      await createAuditLog({
        adminId: req.admin.id,
        action: 'campaign_' + action,
        resourceType: 'campaign',
        resourceId: result.id,
        details: { campaign: result }
      });

      return res.json(result);
    }

    // API: GET /api/campaigns/:id/analytics
    if (method === 'GET' && path.match(/^\/api\/campaigns\/[\w-]+\/analytics$/)) {
      const analytics = await getCampaignAnalytics(params.id);
      return res.json(analytics);
    }

    // API: GET /api/campaigns/:id/messages
    if (method === 'GET' && path.match(/^\/api\/campaigns\/[\w-]+\/messages$/)) {
      const page = Number(query.page) || 1;
      const perPage = Number(query.perPage) || 50;
      const status = query.status;
      const messages = await listCampaignMessages(params.id, { page, perPage, status });
      return res.json(messages);
    }

    // API: POST /api/campaigns/:id/messages - Queue messages
    if (method === 'POST' && path.match(/^\/api\/campaigns\/[\w-]+\/messages$/)) {
      const campaign = await getCampaign(params.id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Get contacts from selected lists
      const listIds = Array.isArray(campaign.contact_list_ids) && campaign.contact_list_ids.length
        ? campaign.contact_list_ids
        : campaign.contact_list_id ? [campaign.contact_list_id] : [];

      if (!listIds.length) {
        return res.status(400).json({ error: 'No contact lists selected' });
      }

      const contacts: any[] = [];
      for (const listId of listIds) {
        const listContacts = await getContactsInList(listId);
        contacts.push(...listContacts);
      }

      if (!contacts.length) {
        return res.status(400).json({ error: 'No contacts to send to' });
      }

      const queued = await queueCampaignMessages(params.id, contacts);
      await createAuditLog({
        adminId: req.admin.id,
        action: 'campaign_queued',
        resourceType: 'campaign',
        resourceId: campaign.id,
        details: {
          campaign,
          queuedCount: queued
        }
      });

      return res.json({ queued });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('Campaign error:', err);
    res.status(500).json({ error: (err as any).message || 'Internal server error' });
  }
}
