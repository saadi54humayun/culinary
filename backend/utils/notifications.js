const Notification = require("../models/Notification");
async function createNotification({ recipient, actor, type, recipe, comment, eventKey }) {
  if (recipient.toString() === actor.toString()) return;
  try { await Notification.create({ recipient, actor, type, recipe, comment, eventKey }); }
  catch (error) { if (error.code !== 11000) console.error("Notification creation failed:", error.message); }
}
async function removeNotification(eventKey) { await Notification.deleteOne({ eventKey }); }
module.exports = { createNotification, removeNotification };
