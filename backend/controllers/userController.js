const User = require("../models/User");
const Follow = require("../models/Follow");
const { createNotification, removeNotification } = require("../utils/notifications");

function isValidUsername(username) {
  return /^[a-z0-9_]{3,30}$/.test(username);
}

function normalizeUsername(username) {
  return typeof username === "string" ? username.trim().toLowerCase() : "";
}
function cursorFilter(cursor) {
  if (cursor === undefined) return null;
  try { const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); if (!value || !/^[a-fA-F0-9]{24}$/.test(value.id) || typeof value.username !== "string") throw new Error(); return { $or: [{ username: { $gt: value.username } }, { username: value.username, _id: { $gt: value.id } }] }; } catch { return false; }
}
async function withFollowState(users, viewerId) {
  const ids = users.map((user) => user._id);
  const follows = await Follow.find({ follower: viewerId, following: { $in: ids } }).select("following").lean();
  const followed = new Set(follows.map((row) => row.following.toString()));
  return users.map((user) => ({ id: user._id, username: user.username, displayName: user.displayName, bio: user.bio, profilePhotoUrl: user.profilePhotoUrl, isFollowing: followed.has(user._id.toString()) }));
}
async function searchUsers(req, res) {
  const search = req.query.search ?? ""; const cursor = cursorFilter(req.query.cursor);
  if (typeof search !== "string" || search.trim().length < 1 || search.length > 100) return res.status(400).json({ message: "Search must be 1–100 characters." });
  if (cursor === false) return res.status(400).json({ message: "Invalid pagination cursor." });
  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const match = { $or: [{ username: { $regex: escaped, $options: "i" } }, { displayName: { $regex: escaped, $options: "i" } }] };
  const rows = await User.find(cursor ? { $and: [match, cursor] } : match).select("_id username displayName bio profilePhotoUrl").sort({ username: 1, _id: 1 }).limit(21).lean(); const page = rows.slice(0, 20); const last = page[page.length - 1];
  return res.json({ users: await withFollowState(page, req.user._id), nextCursor: rows.length > 20 ? Buffer.from(JSON.stringify({ id: last._id, username: last.username })).toString("base64url") : null });
}
async function listConnections(req, res) {
  const type = req.params.type; if (!["followers", "following"].includes(type)) return res.status(404).json({ message: "List not found." });
  const profile = await findUserByUsername(req.params.username); if (profile.error) return res.status(profile.status || 400).json({ message: profile.error });
  const key = type === "followers" ? "following" : "follower"; const other = type === "followers" ? "follower" : "following";
  let cursor = null;
  if (req.query.cursor !== undefined) {
    try { const value = JSON.parse(Buffer.from(req.query.cursor, "base64url").toString("utf8")); if (!value || !/^[a-fA-F0-9]{24}$/.test(value.id) || Number.isNaN(Date.parse(value.createdAt))) throw new Error(); cursor = value; }
    catch { return res.status(400).json({ message: "Invalid pagination cursor." }); }
  }
  const filter = { [key]: profile.user._id };
  if (cursor) { const date = new Date(cursor.createdAt); filter.$or = [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: cursor.id } }]; }
  const total = await Follow.countDocuments({ [key]: profile.user._id }); const rows = await Follow.find(filter).sort({ createdAt: -1, _id: -1 }).limit(21).populate(other, "username displayName bio profilePhotoUrl").lean(); const page = rows.slice(0, 20); const users = page.map((row) => row[other]).filter(Boolean); const last = page[page.length - 1];
  return res.json({ total, users: await withFollowState(users, req.user._id), nextCursor: rows.length > 20 ? Buffer.from(JSON.stringify({ id: last._id, createdAt: last.createdAt.toISOString() })).toString("base64url") : null });
}

async function getProfileCounts(userId) {
  const [followersCount, followingCount] = await Promise.all([
    Follow.countDocuments({ following: userId }),
    Follow.countDocuments({ follower: userId })
  ]);

  return { followersCount, followingCount };
}

async function findUserByUsername(username) {
  const normalizedUsername = normalizeUsername(username);

  if (!isValidUsername(normalizedUsername)) {
    return { error: "Invalid username." };
  }

  const user = await User.findOne({ username: normalizedUsername })
    .select("_id username displayName bio profilePhotoUrl")
    .lean();

  if (!user) {
    return { error: "User not found.", status: 404 };
  }

  return { user };
}

async function sendFollowState(res, targetUser, isFollowing) {
  const { followersCount, followingCount } = await getProfileCounts(
    targetUser._id
  );

  return res.status(200).json({
    isFollowing,
    followersCount,
    followingCount
  });
}

async function getPublicProfile(req, res) {
  try {
    const result = await findUserByUsername(req.params.username);

    if (result.error) {
      return res.status(result.status || 400).json({
        message: result.error
      });
    }

    const { user } = result;
    const [counts, follow] = await Promise.all([
      getProfileCounts(user._id),
      Follow.exists({ follower: req.user._id, following: user._id })
    ]);

    return res.status(200).json({
      user: {
        id: user._id,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
        profilePhotoUrl: user.profilePhotoUrl,
        followersCount: counts.followersCount,
        followingCount: counts.followingCount,
        isFollowing: Boolean(follow)
      }
    });
  } catch (error) {
    console.error("Fetching public profile failed:", error.message);

    return res.status(500).json({
      message: "Unable to load this profile."
    });
  }
}

async function followUser(req, res) {
  try {
    const result = await findUserByUsername(req.params.username);

    if (result.error) {
      return res.status(result.status || 400).json({ message: result.error });
    }

    const { user } = result;

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot follow yourself." });
    }

    try {
      const update = await Follow.updateOne(
        { follower: req.user._id, following: user._id },
        {
          $setOnInsert: {
            follower: req.user._id,
            following: user._id
          }
        },
        { upsert: true }
      );
      if (update.upsertedCount) await createNotification({ recipient: user._id, actor: req.user._id, type: "follow", eventKey: `follow:${req.user._id}:${user._id}` });
    } catch (error) {
      // Concurrent follow requests may race on the unique index. In either
      // case, the intended relationship exists, so return the current state.
      if (error.code !== 11000) throw error;
    }

    return sendFollowState(res, user, true);
  } catch (error) {
    console.error("Following user failed:", error.message);

    return res.status(500).json({
      message: "Unable to follow this user. Please try again."
    });
  }
}

async function unfollowUser(req, res) {
  try {
    const result = await findUserByUsername(req.params.username);

    if (result.error) {
      return res.status(result.status || 400).json({ message: result.error });
    }

    const { user } = result;

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: "You cannot unfollow yourself." });
    }

    await Follow.deleteOne({
      follower: req.user._id,
      following: user._id
    });
    await removeNotification(`follow:${req.user._id}:${user._id}`);

    return sendFollowState(res, user, false);
  } catch (error) {
    console.error("Unfollowing user failed:", error.message);

    return res.status(500).json({
      message: "Unable to unfollow this user. Please try again."
    });
  }
}

module.exports = { getPublicProfile, followUser, unfollowUser, searchUsers, listConnections };
