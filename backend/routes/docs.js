const express = require('express');
const router = express.Router();
const { nanoid } = require('nanoid');
const Document = require('../models/Document');
const Snapshot = require('../models/Snapshot');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { saveContent, deleteBlobByUrl } = require('../utils/storageService');

// Protect all routes
router.use(authMiddleware);

// GET /api/docs - Return all docs for this user (Owner or Collaborator)
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const docs = await Document.find({
      $or: [
        { ownerId: userId },
        { collaborators: userId }
      ]
    })
    .populate('ownerId', 'username email')
    .sort({ updatedAt: -1 });
    
    res.json(docs);
  } catch (error) {
    console.error('Fetch docs error:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// POST /api/docs/create - Create a new document
router.post('/create', async (req, res) => {
  try {
    const roomId = nanoid(8);
    const { type = 'text' } = req.body;
    const validTypes = ['text', 'code', 'notes'];
    const docType = validTypes.includes(type) ? type : 'text';

    const defaultContent = docType === 'text'
      ? JSON.stringify({ ops: [{ insert: "Welcome to DocuSync!\n" }] })
      : "Welcome to DocuSync!\n\nStart editing collaboratively here.";

    const storageResult = await saveContent(roomId, defaultContent);

    const newDoc = await Document.create({
      roomId,
      ownerId: req.user.userId,
      title: "Untitled Document",
      isPublic: false,
      type: docType,
      content: storageResult.data,
      storageType: storageResult.storageType,
      blobUrl: storageResult.blobUrl,
      contentSize: storageResult.contentSize
    });

    res.status(201).json(newDoc);
  } catch (error) {
    console.error('Create doc error:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// POST /api/docs/add-collaborator - Add collaborator to document
router.post('/add-collaborator', async (req, res) => {
  try {
    const { roomId, email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const doc = await Document.findOne({ roomId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    
    if (doc.ownerId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Only the owner can add collaborators' });
    }

    const collabUser = await User.findOne({ email });
    if (!collabUser) {
      return res.status(404).json({ error: 'User not found with this email' });
    }

    if (doc.ownerId.toString() === collabUser._id.toString()) {
      return res.status(400).json({ error: 'Owner cannot be added as a collaborator' });
    }

    // $addToSet natively prevents duplicates
    await Document.updateOne(
      { _id: doc._id },
      { $addToSet: { collaborators: collabUser._id } }
    );

    res.json({ success: true, message: 'Collaborator added' });
  } catch (error) {
    console.error('Add collaborator error:', error);
    res.status(500).json({ error: 'Failed to add collaborator' });
  }
});

// PUT /api/docs/:roomId/rename - Rename a document
router.put('/:roomId/rename', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title required' });

    const doc = await Document.findOne({ roomId: req.params.roomId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (doc.ownerId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Only the owner can rename the document' });
    }

    doc.title = title.trim();
    await doc.save();

    if (req.io) {
      req.io.to(req.params.roomId).emit('document-meta-updated', {
        title: doc.title,
        isPublic: doc.isPublic
      });
    }

    res.json({ success: true, title: doc.title });
  } catch (error) {
    console.error('Rename doc error:', error);
    res.status(500).json({ error: 'Failed to rename document' });
  }
});

// PUT /api/docs/:roomId/visibility - Toggle public/private
router.put('/:roomId/visibility', async (req, res) => {
  try {
    const { isPublic } = req.body;
    
    const doc = await Document.findOne({ roomId: req.params.roomId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (doc.ownerId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Only the owner can change visibility' });
    }

    doc.isPublic = !!isPublic;
    await doc.save();

    if (req.io) {
      req.io.to(req.params.roomId).emit('document-meta-updated', {
        title: doc.title,
        isPublic: doc.isPublic
      });
    }

    res.json({ success: true, isPublic: doc.isPublic });
  } catch (error) {
    console.error('Visibility doc error:', error);
    res.status(500).json({ error: 'Failed to update visibility' });
  }
});

// DELETE /api/docs/:roomId - Delete document completely
router.delete('/:roomId', async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const doc = await Document.findOne({ roomId });
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (doc.ownerId.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Only the owner can delete the document' });
    }

    const snapshots = await Snapshot.find({ roomId }).select('blobUrl');
    const blobUrls = [doc.blobUrl, ...snapshots.map((s) => s.blobUrl)].filter(Boolean);

    // Attempt blob cleanup first, but continue even when individual blob deletions fail.
    const blobDeletionResults = await Promise.allSettled(
      blobUrls.map((blobUrl) => deleteBlobByUrl(blobUrl))
    );
    const blobDeleteFailures = blobDeletionResults.filter((result) => result.status === 'rejected');
    if (blobDeleteFailures.length > 0) {
      console.warn(`Blob cleanup had ${blobDeleteFailures.length} failures for room ${roomId}`);
      blobDeleteFailures.forEach((failure) => {
        console.warn('Blob deletion failure:', failure.reason?.message || failure.reason);
      });
    }

    // Cascade Mongo cleanup after blob delete attempts.
    await Promise.all([
      Document.deleteOne({ _id: doc._id }),
      Snapshot.deleteMany({ roomId }),
      ActivityLog.deleteMany({ roomId })
    ]);

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete doc error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

module.exports = router;
