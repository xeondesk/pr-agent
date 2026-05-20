'use client';

export function Header() {
  return (
    <header className="header-container">
      <div className="header-content">
        <div className="header-left">
          <h1>PR Analysis Dashboard</h1>
          <nav className="breadcrumb">
            <span>Dashboard</span>
            <span>/</span>
            <span>Analyze</span>
          </nav>
        </div>
        <div className="header-right">
          <button className="btn-secondary" title="Help">?</button>
          <button className="btn-secondary" title="Notifications">🔔</button>
        </div>
      </div>
    </header>
  );
}
