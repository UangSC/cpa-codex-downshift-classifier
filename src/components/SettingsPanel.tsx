export function SettingsPanel({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}
