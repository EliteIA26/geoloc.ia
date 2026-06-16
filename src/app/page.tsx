import Link from "next/link";

export default function Home() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold text-emerald-900">Panel Territorial Agrícola · La Rioja</h1>
      <Link href="/panel" className="rounded bg-emerald-700 px-4 py-2 text-white">Abrir el panel</Link>
    </main>
  );
}
