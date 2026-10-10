"use client";

import { useState } from "react";
import RawDataModal from "./RawDataModal";

/** The subtle "</> View SerpApi Data" button. Opens the stored raw response for the business in a modal. */
export default function ViewRawButton({ business }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-subtle view-raw" onClick={() => setOpen(true)}>
        <span aria-hidden="true">{"</>"}</span> View SerpApi Data
      </button>
      {open && <RawDataModal businessId={business.id} businessName={business.name} onClose={() => setOpen(false)} />}
    </>
  );
}
