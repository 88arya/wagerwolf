import SignedOutOnly from "@/components/SignedOutOnly";
import LandingCta from "@/components/LandingCta";
import PropMarquee from "@/components/PropMarquee";
import { HelmetMarkDefs } from "@/components/HelmetMark";
import PlayoffReveal from "@/components/PlayoffReveal";
import WhyWagerwolf from "@/components/WhyWagerwolf";

export default function LandingPage() {
  return (
    <>
      <SignedOutOnly />

      <div className="lp">
        <section className="lp-section is-dots is-centered">
          <div className="lp-inner">
            <h1 className="lp-h1">
              The world&rsquo;s first{" "}
              <span className="lp-h1-run">fantasy football sportsbook.</span>
            </h1>
            <LandingCta />
          </div>
        </section>

        <section className="lp-section is-marquee">
          <PropMarquee />
        </section>

        <HelmetMarkDefs />
        <PlayoffReveal />

        <WhyWagerwolf />

        <section className="lp-section is-centered is-band">
          <div className="lp-inner">
            <h2 className="lp-h2">Ready to play?</h2>
            <LandingCta consent={false} />
          </div>
        </section>
      </div>
    </>
  );
}
