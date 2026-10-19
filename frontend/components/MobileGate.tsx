import LogoWordmark from "@/components/LogoWordmark";

export default function MobileGate() {
  return (
    <div className="mobile-gate">
      <div className="mobile-gate-brand">
        <LogoWordmark height={30} bare />
      </div>
      <div className="mobile-gate-inner">
        <h1 className="mobile-gate-title">
          Sorry, Wagerwolf does not yet support mobile devices.
        </h1>
      </div>
    </div>
  );
}
