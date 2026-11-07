const Notification = require("../models/Notification");

function validId(id) { return /^[a-fA-F0-9]{24}$/.test(id); }
function cursorFilter(cursor) {
  if (cursor === undefined) return null;
  try {
    if (typeof cursor !== "string" || cursor.length > 500) throw new Error();
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!value || !validId(value.id) || Number.isNaN(Date.parse(value.createdAt))) throw new Error();
    const date = new Date(value.createdAt);
    return { $or: [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: value.id } }] };
  } catch { return false; }
}
function serialize(row) {
  return { _id: row._id, type: row.type, recipe: row.recipe || null, comment: row.comment || null, readAt: row.readAt, createdAt: row.createdAt, actor: row.actor ? { username: row.actor.username, displayName: row.actor.displayName, profilePhotoUrl: row.actor.profilePhotoUrl } : null };
}

async function listNotifications(req, res) {
  try {
    const limit = 20; const after = cursorFilter(req.query.cursor);
    if (after === false) return res.status(400).json({ message: "Invalid pagination cursor." });
    const filter = after ? { recipient: req.user._id, $and: [after] } : { recipient: req.user._id };
    const rows = await Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 }).limit(limit + 1)
      .populate("actor", "username displayName profilePhotoUrl").lean();
    const page = rows.slice(0, limit); const last = page[page.length - 1];
    return res.json({ notifications: page.map(serialize), nextCursor: rows.length > limit ? Buffer.from(JSON.stringify({ id: last._id, createdAt: last.createdAt.toISOString() })).toString("base64url") : null });
  } catch (error) { return res.status(500).json({ message: "Unable to load notifications." }); }
}
async function unreadCount(req, res) {
  try { return res.json({ count: await Notification.countDocuments({ recipient: req.user._id, readAt: null }) }); }
  catch { return res.status(500).json({ message: "Unable to load notification count." }); }
}
async function markRead(req, res) {
  if (!validId(req.params.id)) return res.status(400).json({ message: "Invalid notification ID." });
  const row = await Notification.findOneAndUpdate({ _id: req.params.id, recipient: req.user._id, readAt: null }, { $set: { readAt: new Date() } }, { new: true });
  if (!row) return res.status(404).json({ message: "Notification not found." });
  return res.json({ notification: row });
}
async function markAllRead(req, res) {
  const before = new Date();
  await Notification.updateMany({ recipient: req.user._id, readAt: null, createdAt: { $lte: before } }, { $set: { readAt: before } });
  return res.json({ message: "Notifications marked as read." });
}
module.exports = { listNotifications, unreadCount, markRead, markAllRead };
