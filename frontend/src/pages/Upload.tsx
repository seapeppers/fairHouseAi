import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { CheckIcon, DocQuestionIcon, UploadIcon } from '../components/Icons'
import { HomeHeader } from '../components/Shell'
import { PrimaryButton, Spinner } from '../components/ui'
import type { HouseholdSummary } from '../types'

const STATUS_FOR_PM = {
  QUALIFIES: 'All documents received',
  NOT_QUALIFIED: 'Decision made by the city',
  MISSING_INFO: '1 document requested',
  NEEDS_REVIEW: 'Under review by the city',
}

function RequestCard({ h }: { h: HouseholdSummary }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const missing = h.missing_documents ?? []

  async function send() {
    if (!file) return
    setState('sending')
    try {
      await api.upload(h.household_id, file)
      setState('sent')
    } catch {
      setState('error')
    }
  }

  if (state === 'sent')
    return (
      <section className="mt-7 flex items-center gap-4 rounded-[20px] bg-white px-[26px] py-6 shadow-[0_0_0_1.5px_var(--color-evergreen)]">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-evergreen text-marker">
          <CheckIcon size={22} />
        </span>
        <div>
          <h2 className="text-lg font-semibold">Sent to the city</h2>
          <p className="text-muted">
            {file?.name} is in the secure Box folder for {h.name}, Unit {h.unit}. The city will re-check this household.
          </p>
        </div>
      </section>
    )

  return (
    <section aria-label="Requests from the city" className="mt-7 rounded-[20px] bg-white px-[26px] py-6 shadow-[0_0_0_1.5px_var(--color-evergreen)]">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-tint px-2.5 py-0.5 text-[13px] font-semibold text-warn">
          <DocQuestionIcon /> Requested by the city
        </span>
        <h2 className="text-lg font-semibold">
          {h.name} · Unit {h.unit}
        </h2>
      </div>
      <p className="mt-2 mb-[18px] text-muted">
        {missing.length === 1 ? 'One document is' : `${missing.length} documents are`} missing before the income review can finish:{' '}
        <strong className="text-warn">{missing.join(', ')}</strong>.
      </p>
      <label
        htmlFor={`upload-${h.household_id}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) setFile(f)
        }}
        className={`flex min-h-[170px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center ${
          dragging ? 'border-evergreen bg-evergreen-tint' : 'border-[#9BB3A5] bg-[#F7FAF7]'
        }`}
      >
        <UploadIcon className="text-evergreen" />
        {file ? (
          <span className="font-semibold">{file.name}</span>
        ) : (
          <>
            <span className="font-semibold">Drop the {missing[0]?.toLowerCase() ?? 'document'} here</span>
            <span className="text-sm text-muted">
              or <span className="text-evergreen underline">choose a file</span> · PDF
            </span>
          </>
        )}
        <input
          ref={inputRef}
          id={`upload-${h.household_id}`}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {state === 'error' && <p role="alert" className="mt-3 text-sm text-fail">Upload failed. Please try again.</p>}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <PrimaryButton disabled={!file || state === 'sending'} onClick={send}>
          {state === 'sending' ? 'Sending to Box…' : 'Send to the city'}
        </PrimaryButton>
        <span className="text-[13px] text-muted">Files go straight to the city’s secure Box folder for this unit.</span>
      </div>
    </section>
  )
}

export default function Upload() {
  const [households, setHouseholds] = useState<HouseholdSummary[] | null>(null)

  useEffect(() => {
    api.households().then(setHouseholds)
  }, [])

  const requests = households?.filter((h) => (h.missing_documents ?? []).length > 0) ?? []

  return (
    <div className="min-h-screen">
      <HomeHeader variant="property_manager" />
      <main className="mx-auto max-w-[1120px] px-8 pt-5 pb-12">
        <h1 className="font-serif text-4xl leading-tight font-semibold">{households?.[0]?.building ?? 'Juniper Court Apartments'}</h1>
        <p className="mt-1.5 text-muted">Upload tenant income documents for the Seattle Office of Housing. You can only see this building.</p>

        {!households ? (
          <div className="mt-8">
            <Spinner label="Loading your building from Box…" />
          </div>
        ) : (
          <>
            {requests.map((h) => (
              <RequestCard key={h.household_id} h={h} />
            ))}
            <h2 className="mt-9 mb-2.5 text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">All households</h2>
            <ul className="flex list-none flex-col gap-2 p-0">
              {households.map((h) => (
                <li key={h.household_id} className="flex flex-wrap items-center gap-x-5 gap-y-2.5 rounded-[14px] bg-white px-[18px] py-3.5 shadow-[0_0_0_1px_var(--color-line)]">
                  <span className="flex-[1_1_240px] font-semibold">
                    {h.name} · Unit {h.unit}
                  </span>
                  <span className={`text-sm ${h.status === 'MISSING_INFO' ? 'text-warn' : 'text-muted'}`}>
                    {h.status ? STATUS_FOR_PM[h.status] : 'Waiting for documents'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-5 text-[13px] text-muted">Property managers upload documents only. Eligibility decisions are made by the Seattle Office of Housing.</p>
      </main>
    </div>
  )
}
