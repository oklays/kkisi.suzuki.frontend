import { redirect } from 'next/navigation';

// The app starts at Beranda; the proxy already sent visitors without a session to /masuk.
export default function Root() {
  redirect('/beranda');
}
