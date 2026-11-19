import { Redirect } from 'expo-router';

/** Deep-link landing for email verification / OAuth return (saigefit://auth-callback). Session is picked up by the root Gate. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
