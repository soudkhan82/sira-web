import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ADMIN_EMAILS = new Set([
  "soudkhan82@gmail.com",
  "admin@gmail.com",
]);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Supabase function environment is not configured.");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

type RequestBody = {
  action?: string;
  userId?: string;
  signupEnabled?: boolean;
  email?: string;
  password?: string;
  fullName?: string;
  company?: string;
  mobileNumber?: string;
  role?: string;
  jobTitle?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isStrongPassword(password: string) {
  return (
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function validateProfile(body: RequestBody) {
  const email = normalizeEmail(body.email);
  const fullName = clean(body.fullName);
  const company = clean(body.company);
  const mobileNumber = clean(body.mobileNumber);
  const jobTitle = clean(body.jobTitle);
  const role = clean(body.role) || jobTitle || "Field Engineer";

  if (!email || !email.includes("@")) {
    throw new Error("A valid email address is required.");
  }

  if (!fullName || !company || !mobileNumber || !jobTitle) {
    throw new Error(
      "Full name, company, mobile number and job title are required."
    );
  }

  return {
    email,
    fullName,
    company,
    mobileNumber,
    jobTitle,
    role,
  };
}

async function getSignupEnabled() {
  const { data, error } = await admin
    .from("sira_app_settings")
    .select("signup_enabled")
    .eq("id", 1)
    .single();

  if (error) throw error;
  return data.signup_enabled === true;
}

async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw new Error("Authentication required.");
  }

  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);

  if (error || !user) {
    throw new Error("Authentication required.");
  }

  return user;
}

async function isAdministratorEmail(email: string) {
  const normalized = normalizeEmail(email);

  if (ADMIN_EMAILS.has(normalized)) return true;

  const { data, error } = await admin
    .from("sira_admins")
    .select("email")
    .eq("email", normalized)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function requireAdministrator(req: Request) {
  const user = await getAuthenticatedUser(req);
  const email = normalizeEmail(user.email);

  if (!email || !(await isAdministratorEmail(email))) {
    throw new Error("Administrator access required.");
  }

  return user;
}

async function writeProfile(
  userId: string,
  profile: ReturnType<typeof validateProfile>
) {
  const { error } = await admin.from("sira_user_profiles").upsert(
    {
      id: userId,
      full_name: profile.fullName,
      company: profile.company,
      mobile_number: profile.mobileNumber,
      role: profile.role,
      job_title: profile.jobTitle,
      username: profile.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) throw error;
}

async function createAccount(body: RequestBody, respectSignupSwitch: boolean) {
  if (respectSignupSwitch && !(await getSignupEnabled())) {
    throw new Error("New user sign-up is currently disabled.");
  }

  const profile = validateProfile(body);
  const password = String(body.password ?? "");

  if (!isStrongPassword(password)) {
    throw new Error(
      "Password must be at least 8 characters and include a letter, number and special character."
    );
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: profile.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: profile.fullName,
      company: profile.company,
      mobile_number: profile.mobileNumber,
      role: profile.role,
      job_title: profile.jobTitle,
      username: profile.email,
    },
  });

  if (error || !data.user) {
    if (respectSignupSwitch) {
      throw new Error("Account could not be created. Check the details and try again.");
    }

    throw error ?? new Error("Account could not be created.");
  }

  try {
    await writeProfile(data.user.id, profile);
  } catch (profileError) {
    await admin.auth.admin.deleteUser(data.user.id, false);
    throw profileError;
  }

  return data.user.id;
}

async function listAllAuthUsers() {
  const users = [];
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    users.push(...data.users);

    if (data.users.length < perPage) break;
    page += 1;
  }

  return users;
}

async function listAllProfiles() {
  const profiles = [];
  const pageSize = 1000;
  let from = 0;

  while (from < 10000) {
    const { data, error } = await admin
      .from("sira_user_profiles")
      .select(
        "id,full_name,company,mobile_number,role,job_title,username,created_at,updated_at"
      )
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const rows = data ?? [];
    profiles.push(...rows);

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return profiles;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ message: "Method not allowed." }, 405);
  }

  try {
    const body = (await req.json()) as RequestBody;
    const action = clean(body.action);

    if (action === "status") {
      return json({
        signupEnabled: await getSignupEnabled(),
        passwordPolicy: {
          minLength: 8,
          requiresLetter: true,
          requiresNumber: true,
          requiresSpecial: true,
        },
      });
    }

    if (action === "signup") {
      await createAccount(body, true);
      return json({
        ok: true,
        message: "Account created successfully.",
      });
    }

    if (action === "admin-status") {
      const user = await getAuthenticatedUser(req);
      const administrator = await isAdministratorEmail(
        normalizeEmail(user.email)
      );

      return json({
        isAdmin: administrator,
        signupEnabled: await getSignupEnabled(),
      });
    }

    const administrator = await requireAdministrator(req);

    if (action === "set-signup") {
      if (typeof body.signupEnabled !== "boolean") {
        throw new Error("A valid sign-up setting is required.");
      }

      const { error } = await admin.from("sira_app_settings").upsert(
        {
          id: 1,
          signup_enabled: body.signupEnabled,
          updated_at: new Date().toISOString(),
          updated_by: administrator.id,
        },
        { onConflict: "id" }
      );

      if (error) throw error;

      return json({
        ok: true,
        signupEnabled: body.signupEnabled,
      });
    }

    if (action === "create-user") {
      const userId = await createAccount(body, false);
      return json({ ok: true, userId });
    }

    if (action === "list-users") {
      const [authUsers, profiles] = await Promise.all([
        listAllAuthUsers(),
        listAllProfiles(),
      ]);

      const profileById = new Map(
        profiles.map((profile) => [String(profile.id), profile])
      );

      const users = authUsers
        .map((user) => {
          const profile = profileById.get(user.id);

          return {
            id: user.id,
            email: normalizeEmail(user.email),
            emailConfirmedAt: user.email_confirmed_at ?? null,
            createdAt: user.created_at ?? null,
            fullName: clean(profile?.full_name ?? user.user_metadata?.full_name),
            company: clean(profile?.company ?? user.user_metadata?.company),
            mobileNumber: clean(
              profile?.mobile_number ?? user.user_metadata?.mobile_number
            ),
            role: clean(profile?.role ?? user.user_metadata?.role),
            jobTitle: clean(
              profile?.job_title ?? user.user_metadata?.job_title
            ),
          };
        })
        .filter((user) => user.email)
        .sort((a, b) =>
          (a.fullName || a.email).localeCompare(b.fullName || b.email)
        );

      return json({ users });
    }

    if (action === "update-user") {
      const userId = clean(body.userId);
      if (!userId) throw new Error("User ID is required.");

      const profile = validateProfile(body);
      const password = String(body.password ?? "");

      if (password && !isStrongPassword(password)) {
        throw new Error(
          "Password must be at least 8 characters and include a letter, number and special character."
        );
      }

      const {
        data: { user: targetUser },
        error: targetError,
      } = await admin.auth.admin.getUserById(userId);

      if (targetError || !targetUser) {
        throw targetError ?? new Error("User was not found.");
      }

      const existingEmail = normalizeEmail(targetUser.email);

      if (
        ADMIN_EMAILS.has(existingEmail) &&
        profile.email !== existingEmail
      ) {
        throw new Error(
          "The designated administrator email address cannot be changed."
        );
      }

      const attributes: any = {
        email: profile.email,
        email_confirm: true,
        user_metadata: {
          ...(targetUser.user_metadata ?? {}),
          full_name: profile.fullName,
          company: profile.company,
          mobile_number: profile.mobileNumber,
          role: profile.role,
          job_title: profile.jobTitle,
          username: profile.email,
        },
      };

      if (password) {
        attributes.password = password;
      }

      const { error: updateError } =
        await admin.auth.admin.updateUserById(userId, attributes);

      if (updateError) throw updateError;

      await writeProfile(userId, profile);

      return json({ ok: true });
    }

    if (action === "delete-user") {
      const userId = clean(body.userId);
      if (!userId) throw new Error("User ID is required.");

      if (userId === administrator.id) {
        throw new Error("You cannot delete your own administrator account.");
      }

      const {
        data: { user: targetUser },
        error: targetError,
      } = await admin.auth.admin.getUserById(userId);

      if (targetError || !targetUser) {
        throw targetError ?? new Error("User was not found.");
      }

      const targetEmail = normalizeEmail(targetUser.email);

      if (ADMIN_EMAILS.has(targetEmail)) {
        throw new Error(
          "Designated administrator accounts cannot be deleted."
        );
      }

      const { error: profileDeleteError } = await admin
        .from("sira_user_profiles")
        .delete()
        .eq("id", userId);

      if (profileDeleteError) throw profileDeleteError;

      const { error: deleteError } = await admin.auth.admin.deleteUser(
        userId,
        false
      );

      if (deleteError) throw deleteError;

      return json({ ok: true });
    }

    return json({ message: "Unknown action." }, 400);
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Request failed.";

    const status =
      message === "Authentication required." ||
      message === "Administrator access required."
        ? 401
        : 400;

    return json({ ok: false, message }, status);
  }
});
