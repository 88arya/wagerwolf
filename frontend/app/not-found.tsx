import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-wide">
      <div className="mx-head">
        <div className="eyebrow">Error 404</div>
        <h1 className="mx-title">This page does not exist</h1>
      </div>
      <p style={{ color: "var(--text-2)", maxWidth: "44ch", marginBottom: 24 }}>
        The address may have changed, or the league it pointed at may have been
        deleted.
      </p>
      <Link className="mx-btn is-primary" href="/home">
        Go to your home page
      </Link>
    </div>
  );
}
