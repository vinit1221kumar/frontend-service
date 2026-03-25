import { getMongoDb, isMongoBackupConfigured } from '@/lib/mongodb';

function sanitizeString(value) {
  return typeof value === 'string' ? value : '';
}

function buildDocument(body) {
  const now = new Date();
  const scope = body?.scope === 'group' ? 'group' : 'direct';
  const firebaseCreatedAt = Number(body?.firebaseCreatedAt || body?.createdAt || Date.now());
  const firebaseUpdatedAt = Number(body?.firebaseUpdatedAt || body?.updatedAt || firebaseCreatedAt);

  return {
    backupKey: sanitizeString(body?.backupKey),
    scope,
    threadId: scope === 'direct' ? sanitizeString(body?.threadId) : '',
    groupId: scope === 'group' ? sanitizeString(body?.groupId) : '',
    messageId: sanitizeString(body?.messageId),
    senderId: sanitizeString(body?.senderId),
    receiverId: scope === 'direct' ? sanitizeString(body?.receiverId) : '',
    content: sanitizeString(body?.content),
    status: body?.status === 'deleted' ? 'deleted' : 'active',
    source: 'firebase',
    firebaseCreatedAt,
    firebaseUpdatedAt,
    backupUpdatedAt: now,
    deletedAt: body?.status === 'deleted' ? now : null,
  };
}

export async function POST(request) {
  if (!isMongoBackupConfigured()) {
    return Response.json({ skipped: true, reason: 'mongo-backup-not-configured' }, { status: 202 });
  }

  try {
    const body = await request.json();
    const backupKey = sanitizeString(body?.backupKey);
    const messageId = sanitizeString(body?.messageId);
    if (!backupKey || !messageId) {
      return Response.json({ error: 'backupKey and messageId are required.' }, { status: 400 });
    }

    const db = await getMongoDb();
    const collection = db.collection('message_backups');
    const document = buildDocument(body);

    await collection.updateOne(
      { backupKey },
      {
        $set: document,
        $setOnInsert: { backupCreatedAt: new Date() }
      },
      { upsert: true }
    );

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[message-backup] write failed', error);
    return Response.json({ error: 'Failed to write message backup.' }, { status: 500 });
  }
}
