import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="app-shell flex min-h-screen flex-col items-center justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Page not found</h1>
      <Link href="/" className="text-amber-700 underline dark:text-sky-400">
        Back to home
      </Link>
    </div>
  );
}
