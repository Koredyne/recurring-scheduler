export default function PageHeader({ title, children }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
      <h1 className="text-base font-semibold tracking-tight">{title}</h1>
      {children}
    </header>
  );
}
