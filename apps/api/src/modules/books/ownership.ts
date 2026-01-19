import { getDefaultOwnerId } from "../auth/repo";
import { backfillProgressOwner, countProgressMissingOwner } from "../progress/repo";
import { backfillBooksOwner, countBooksMissingOwner } from "./repo";

export function ensureDefaultOwnership() {
  const missingBooks = countBooksMissingOwner();
  const missingProgress = countProgressMissingOwner();
  if (missingBooks === 0 && missingProgress === 0) {
    return;
  }
  const ownerId = getDefaultOwnerId();
  if (!ownerId) {
    throw new Error("No users available to assign as default owner.");
  }
  backfillBooksOwner(ownerId);
  backfillProgressOwner(ownerId);
}
