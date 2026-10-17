"use client";

import { useState } from "react";

type Props = {
  userId: string;
  action: (formData: FormData) => void | Promise<void>;
};

export default function RemoveMemberButton({
  userId,
  action,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={action}>
      <input type="hidden" name="user_id" value={userId} />

      {!confirming ? (
        <button
          type="button"
          className="button button-secondary"
          onClick={() => setConfirming(true)}
        >
          Remove member
        </button>
      ) : (
        <div className="remove-confirmation">
          <p>Remove this member from the community?</p>

          <button className="button button-danger" type="submit">
            Yes, remove
          </button>

          <button
            className="button button-secondary"
            type="button"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}