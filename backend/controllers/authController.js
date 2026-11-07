const User = require("../models/User");
const argon2 = require("argon2");
const {
  SESSION_COOKIE_NAME,
  cookieOptions
} = require("../config/session");
const { issueOtp, consumeOtp, issueResetGrant, consumeResetGrant, ipAllowed } = require("../services/otpService");

const RESET_GRANT_COOKIE = "culinary.reset";
const resetGrantCookie = { ...cookieOptions, maxAge: 10 * 60 * 1000 };
function passwordIsValid(password) { return typeof password === "string" && password.length >= 15 && password.length <= 128 && Boolean(password.trim()); }
function maskEmail(email) { const [local, domain] = email.split("@"); return `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain}`; }
function readCookie(req, name) {
  const encoded = (req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  try { return encoded ? decodeURIComponent(encoded) : ""; } catch { return ""; }
}

async function signup(req, res) {
    try{

        const { username, email, password } = req.body;
        
        if (
        typeof username !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string"
        ) {
        return res.status(400).json({
            message: "Username, email, and password are required."
        });
        }

        const normalizedUsername = username.trim().toLowerCase();
        const normalizedEmail = email.trim().toLowerCase();

        if(!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)){
            return res.status(400).json({
                message: "Username must be 3–30 characters: letters, numbers, or underscores."
            })
        }

        if( normalizedEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
            ) {
            return res.status(400).json({
                message: "Please provide a valid email address."
            });
        }

        if (!passwordIsValid(password)) {
            return res.status(400).json({
                message: "Password must be between 15 and 128 characters."
            });
        }

        if (!normalizedUsername || !normalizedEmail || !password.trim()) {
        return res.status(400).json({
            message: "Username, email, and password cannot be empty."
        });
        }

        const existingUser = await User.findOne({
        $or: [
            { username: normalizedUsername },
            { email: normalizedEmail }
        ]
        });

        if (existingUser) {
        return res.status(409).json({
            message: "Username or email is already in use."
        });
        }

        const passwordHash = await argon2.hash(password);

        const user = await User.create({
            username: normalizedUsername,
            email: normalizedEmail,
            passwordHash,
            displayName: normalizedUsername,
            verificationRequired: true
        });

        let challenge;
        try { challenge = await issueOtp({ user, purpose: "email-verification", req }); }
        catch (deliveryError) {
            // The pending account is intentional. Return a success response so
            // the browser can move to the resend screen instead of trapping a
            // user at signup with an already-used email address.
            return res.status(201).json({
                message: ["MAIL_NOT_CONFIGURED", "OTP_NOT_CONFIGURED"].includes(deliveryError.code)
                    ? "Account created. Verification email is not configured yet; configure OTP and SMTP settings, then resend your code."
                    : "Account created, but the verification email could not be delivered. Please resend the code.",
                deliveryFailed: true,
                user: { id: user._id, username: user.username, email: user.email, displayName: user.displayName }
            });
        }

        return res.status(201).json({
            message: "Account created. Check your email for the verification code.",
            challenge,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                displayName: user.displayName
            }
        });

    }

    catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
            message: "Username or email is already in use."
            });
        }

        console.error("Signup failed:", error.message);

        return res.status(500).json({
            message: "Something went wrong. Please try again."
        });
    }
}


async function login(req, res) {
  try {
    const { email, password } = req.body ?? {};

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail
    }).select("+passwordHash");

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      password
    );

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    if (user.verificationRequired && !user.emailVerifiedAt) {
      return res.status(403).json({ message: "Verify your email before logging in.", verificationRequired: true, email: maskEmail(user.email) });
    }

    await new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
        if (error) return reject(error);
        resolve();
    });
    });

    // Store only the user ID in the session.
    req.session.userId = user._id.toString();
    req.session.userVersion = user.sessionVersion;

    // Ensure MongoDB has saved the session before returning success.
    await new Promise((resolve, reject) => {
    req.session.save((error) => {
        if (error) return reject(error);
        resolve();
    });
    });

    return res.status(200).json({
    message: "Logged in successfully.",
    user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        bio: user.bio,
        profilePhotoUrl: user.profilePhotoUrl
    }
    });

  } catch (error) {
    console.error("Login failed:", error.message);

    return res.status(500).json({
      message: "Something went wrong. Please try again."
    });
  }
}

async function resendVerification(req, res) {
  try {
    const { email } = req.body || {};
    if (typeof email !== "string" || !email.trim()) return res.status(400).json({ message: "Enter your email address." });
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || !user.verificationRequired || user.emailVerifiedAt) return res.status(200).json({ message: "If verification is needed, a new code has been sent." });
    const challenge = await issueOtp({ user, purpose: "email-verification", req });
    return res.json({ message: "A new verification code has been sent.", challenge, email: maskEmail(user.email) });
  } catch (error) { return res.status(error.status || 503).json({ message: error.message || "Unable to send a code right now." }); }
}

async function verifySignupOtp(req, res) {
  try {
    const token = await consumeOtp({ challengeId: req.body?.challengeId, code: req.body?.code, purpose: "email-verification", req });
    const user = await User.findOneAndUpdate({ _id: token.user, emailVerifiedAt: null }, { $set: { emailVerifiedAt: new Date() } }, { new: true });
    if (!user) return res.status(400).json({ message: "That code is invalid or expired." });
    return res.json({ message: "Email verified. You can now log in." });
  } catch (error) { return res.status(error.status || 400).json({ message: error.message || "That code is invalid or expired." }); }
}

async function requestPasswordReset(req, res) {
  const generic = () => ({ message: "If an account matches that email, a recovery code has been sent.", challengeId: require("crypto").randomBytes(18).toString("base64url") });
  try {
    const email = req.body?.email;
    if (typeof email !== "string" || !email.trim() || !ipAllowed(req, "recover", 8)) return res.json(generic());
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (user) {
      try {
        const challenge = await issueOtp({ user, purpose: "password-reset", req });
        return res.json({ message: "If an account matches that email, a recovery code has been sent.", challengeId: challenge.challengeId });
      } catch { /* Preserve account privacy. */ }
    }
    return res.json(generic());
  } catch { return res.json(generic()); }
}

async function verifyPasswordResetOtp(req, res) {
  try {
    const token = await consumeOtp({ challengeId: req.body?.challengeId, code: req.body?.code, purpose: "password-reset", req });
    const grant = await issueResetGrant({ _id: token.user });
    res.cookie(RESET_GRANT_COOKIE, grant, resetGrantCookie);
    return res.json({ message: "Code verified. Choose a new password." });
  } catch (error) { return res.status(error.status || 400).json({ message: "That code is invalid or expired." }); }
}

async function resetPassword(req, res) {
  try {
    const { password, confirmPassword } = req.body || {};
    if (!passwordIsValid(password)) return res.status(400).json({ message: "Password must be between 15 and 128 characters." });
    if (password !== confirmPassword) return res.status(400).json({ message: "Passwords do not match." });
    const grant = await consumeResetGrant(readCookie(req, RESET_GRANT_COOKIE));
    if (!grant) return res.status(400).json({ message: "Your reset session is invalid or expired. Request another code." });
    const passwordHash = await argon2.hash(password);
    const user = await User.findOneAndUpdate({ _id: grant.user }, { $set: { passwordHash }, $inc: { sessionVersion: 1 } });
    res.clearCookie(RESET_GRANT_COOKIE, cookieOptions);
    if (!user) return res.status(400).json({ message: "Your reset session is invalid or expired. Request another code." });
    return res.json({ message: "Password reset successfully. Please log in." });
  } catch (error) { return res.status(500).json({ message: "Unable to reset password. Please try again." }); }
}



function getMe(req, res) {
  return res.status(200).json({
    user: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      displayName: req.user.displayName,
      bio: req.user.bio,
      profilePhotoUrl: req.user.profilePhotoUrl
    }
  });
}

function logout(req, res) {
  req.session.destroy((error) => {
    if (error) {
      console.error("Logout failed:", error.message);

      return res.status(500).json({
        message: "Unable to log out. Please try again."
      });
    }

    res.clearCookie(SESSION_COOKIE_NAME, cookieOptions);

    return res.status(200).json({
      message: "Logged out successfully."
    });
  });
}


async function updateProfile(req, res) {
  try {
    const { displayName, bio, profilePhotoUrl } = req.body ?? {};

    if (
      typeof displayName !== "string" ||
      typeof bio !== "string"
    ) {
      return res.status(400).json({
        message: "Display name and bio must be text."
      });
    }

    const trimmedName = displayName.trim();
    const trimmedBio = bio.trim();

    if (trimmedName.length < 1 || trimmedName.length > 50) {
      return res.status(400).json({
        message: "Display name must be between 1 and 50 characters."
      });
    }

    if (trimmedBio.length > 300) {
      return res.status(400).json({
        message: "Bio must be 300 characters or fewer."
      });
    }

    const updates = { displayName: trimmedName, bio: trimmedBio };

    // Omitted photos leave the existing photo unchanged.
    if (profilePhotoUrl !== undefined) {
      let validPhotoUrl = profilePhotoUrl === "";

      if (typeof profilePhotoUrl === "string" && profilePhotoUrl.length <= 2048) {
        try {
          const photoUrl = new URL(profilePhotoUrl);
          validPhotoUrl =
            photoUrl.protocol === "https:" &&
            photoUrl.hostname === "res.cloudinary.com" &&
            !photoUrl.username && !photoUrl.password && !photoUrl.port &&
            photoUrl.pathname.startsWith(
              `/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`
            );
        } catch {
          // Empty strings are allowed; other malformed URLs are rejected below.
        }
      }

      if (!validPhotoUrl) {
        return res.status(400).json({ message: "Please upload a valid profile photo." });
      }

      updates.profilePhotoUrl = profilePhotoUrl;
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: updates
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!user) {
      return res.status(404).json({
        message: "User not found."
      });
    }

    return res.status(200).json({
      message: "Profile updated successfully.",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        bio: user.bio,
        profilePhotoUrl: user.profilePhotoUrl
      }
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: "Please check your display name and bio."
      });
    }

    console.error("Profile update failed:", error.message);

    return res.status(500).json({
      message: "Unable to update your profile. Please try again."
    });
  }
}

module.exports = { signup, login, getMe, logout, updateProfile, resendVerification, verifySignupOtp, requestPasswordReset, verifyPasswordResetOtp, resetPassword };
