import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/tenant.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { NoteType } from '@prisma/client';

const router = Router();

// Validation schemas
const createNoteSchema = z.object({
  leadId: z.string(),
  content: z.string().min(1),
  type: z.nativeEnum(NoteType).optional().default('GENERAL'),
  isAdminOnly: z.boolean().optional().default(false),
});

const updateNoteSchema = z.object({
  content: z.string().min(1).optional(),
  type: z.nativeEnum(NoteType).optional(),
  isAdminOnly: z.boolean().optional(),
});

/**
 * GET /notes
 * Get notes for a specific lead
 */
router.get('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { leadId } = z.object({ leadId: z.string() }).parse(req.query);

  // Verify lead exists and user has access
  const lead = await req.db.lead.findFirst({
    where: {
      id: leadId,
      tenantId: req.tenant.id,
      deletedAt: null,
    },
  });

  if (!lead) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }

  // Clinic staff access check
  if (req.tenant.role === 'CLINIC_STAFF' && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic && lead.clinicId !== clinic.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  // Get notes (hide admin-only notes from clinic staff)
  const notes = await req.db.note.findMany({
    where: {
      leadId,
      ...(req.tenant.role === 'CLINIC_STAFF' && { isAdminOnly: false }),
    },
    include: {
      author: {
        select: { id: true, name: true, role: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ notes });
}));

/**
 * POST /notes
 * Create a new note
 */
router.post('/', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const data = createNoteSchema.parse(req.body);

  // Verify lead exists and user has access
  const lead = await req.db.lead.findFirst({
    where: {
      id: data.leadId,
      tenantId: req.tenant.id,
      deletedAt: null,
    },
  });

  if (!lead) {
    res.status(404).json({ error: 'Lead not found' });
    return;
  }

  // Clinic staff access check
  if (req.tenant.role === 'CLINIC_STAFF' && req.tenant.location) {
    const clinic = await req.db.clinic.findFirst({
      where: { tenantId: req.tenant.id, slug: req.tenant.location },
    });
    if (clinic && lead.clinicId !== clinic.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Clinic staff cannot create admin-only notes
    if (data.isAdminOnly) {
      res.status(403).json({ error: 'Admin access required for admin-only notes' });
      return;
    }
  }

  const note = await req.db.note.create({
    data: {
      leadId: data.leadId,
      authorId: req.tenant.userId,
      content: data.content,
      type: data.type,
      isAdminOnly: data.isAdminOnly,
    },
    include: {
      author: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  res.status(201).json({ note });
}));

/**
 * PATCH /notes/:id
 * Update a note
 */
router.patch('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const data = updateNoteSchema.parse(req.body);

  // Find existing note
  const existingNote = await req.db.note.findUnique({
    where: { id: req.params.id },
    include: { lead: true },
  });

  if (!existingNote) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }

  // Only the author or admin can edit notes
  if (existingNote.authorId !== req.tenant.userId && 
      req.tenant.role !== 'ADMIN' && 
      req.tenant.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'You can only edit your own notes' });
    return;
  }

  // Clinic staff cannot set admin-only flag
  if (req.tenant.role === 'CLINIC_STAFF' && data.isAdminOnly) {
    res.status(403).json({ error: 'Admin access required for admin-only notes' });
    return;
  }

  const note = await req.db.note.update({
    where: { id: req.params.id },
    data,
    include: {
      author: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  res.json({ note });
}));

/**
 * DELETE /notes/:id
 * Delete a note
 */
router.delete('/:id', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.tenant || !req.db) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Find existing note
  const existingNote = await req.db.note.findUnique({
    where: { id: req.params.id },
  });

  if (!existingNote) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }

  // Only the author or admin can delete notes
  if (existingNote.authorId !== req.tenant.userId && 
      req.tenant.role !== 'ADMIN' && 
      req.tenant.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'You can only delete your own notes' });
    return;
  }

  await req.db.note.delete({
    where: { id: req.params.id },
  });

  res.json({ message: 'Note deleted successfully' });
}));

export const noteRoutes = router;
