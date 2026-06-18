import Link from "next/link";

export default function Home() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-6 bg-background">
      <h1 className="text-3xl font-bold text-foreground">Panel Territorial Agrícola · La Rioja</h1>
      <div className="flex gap-4">
        <Link href="/panel" className="rounded-xl border border-border bg-card px-6 py-3 text-foreground hover:bg-muted transition-colors">
          Abrir Original (Gestión)
        </Link>
        <Link href="/panel-premium" className="rounded-xl bg-primary px-6 py-3 text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors font-medium">
          🚀 Abrir Premium (Bento Box)
        </Link>
      </div>
    </main>
  );
}
