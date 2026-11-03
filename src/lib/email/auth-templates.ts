import { emailLayout } from "./layout";

/**
 * Sign-in emails sent by Supabase Auth, in Loamy's style. Uploaded by `npm run email:setup`.
 * Links go to /auth/confirm with a one-time token, so they work even when opened in another browser or app.
 * {{ .SiteURL }}, {{ .TokenHash }} and {{ .RedirectTo }} are filled in by Supabase.
 */
const link = (type: string) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&redirect_to={{ .RedirectTo }}`;

export const AUTH_TEMPLATES = {
  confirmation: {
    subject: "Confirm your Loamy account",
    content: emailLayout({
      preheader: "One tap and you’re in.",
      heading: "Welcome to Loamy",
      body: ["Tap the button to confirm your email and finish creating your free account. Your plant plans are saved and waiting."],
      button: { label: "Confirm my email", url: link("email") },
      footnote: "Didn’t sign up for Loamy? You can ignore this email. The link expires in 24 hours.",
    }),
  },
  recovery: {
    subject: "Reset your Loamy password",
    content: emailLayout({
      preheader: "Choose a new password.",
      heading: "Reset your password",
      body: ["Someone (hopefully you) asked to reset the password for your Loamy account. Tap the button to choose a new one."],
      button: { label: "Choose a new password", url: link("recovery") },
      footnote: "Didn’t ask for this? Ignore this email and your password stays the same. The link expires in 1 hour.",
    }),
  },
  email_change: {
    subject: "Confirm your new email for Loamy",
    content: emailLayout({
      preheader: "Confirm the change to your sign-in email.",
      heading: "Confirm your new email",
      body: ["Tap the button to confirm that this is the new email for your Loamy account."],
      button: { label: "Confirm new email", url: link("email_change") },
      footnote: "Didn’t ask for this? Reply to this email and we’ll help.",
    }),
  },
  magic_link: {
    subject: "Your Loamy sign-in link",
    content: emailLayout({
      preheader: "Sign in with one tap.",
      heading: "Sign in to Loamy",
      body: ["Tap the button to sign in."],
      button: { label: "Sign in", url: link("magiclink") },
      footnote: "Didn’t ask for this? You can ignore this email.",
    }),
  },
} as const;
