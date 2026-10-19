import { permanentRedirect } from "next/navigation";

export default function Redirect() {
  permanentRedirect("/docs/terms-of-service");
}
