import { Link } from "react-router";
import { buttonClass } from "../components/ui";

export function NotFound() {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-muted">There is nothing at this address.</p>
      <Link to="/library" className={buttonClass("secondary")}>
        Go to the library
      </Link>
    </div>
  );
}
