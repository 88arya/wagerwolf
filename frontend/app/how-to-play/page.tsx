import { permanentRedirect } from "next/navigation";

export default function Redirect() {
  permanentRedirect("/docs/how-to-play");
}
