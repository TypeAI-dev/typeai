import { toAIFunction } from '../src/aiFunction'
import Debug from 'debug'
const debug = Debug('test')

type Patient = {
  name: string
  age: number
  isSmoker: boolean
}
type Diagnosis = {
  condition: string
  diagnosisDate: Date
  stage?: string
  type?: string
  histology?: string
  complications?: string
}
type Treatment = {
  name: string
  startDate: Date
  endDate?: Date
}
type Medication = Treatment & {
  dose?: string
}
type BloodTest = {
  name: string
  result: string
  testDate: Date
}
type PatientData = {
  patient: Patient
  diagnoses: Diagnosis[]
  treatments: Treatment | Medication[]
  bloodTests: BloodTest[]
}

describe('Build a magic AI function from a function stub', () => {
  test('it should work with functions that return object-typed values', async () => {
    /** @description Returns a PatientData record generate from the content of doctorsNotes notes. */
    function generateElectronicHealthRecordSpec(input: string): PatientData | void {}

    const generateElectronicHealthRecord = toAIFunction(generateElectronicHealthRecordSpec, {
      model: 'gpt-4',
    })

    const notes = `
Ms. Lee, a 45-year-old patient, was diagnosed with type 2 diabetes mellitus on 06-01-2018.
Unfortunately, Ms. Lee's diabetes has progressed and she developed diabetic retinopathy on 09-01-2019.
Ms. Lee was diagnosed with type 2 diabetes mellitus on 06-01-2018.
Ms. Lee was initially diagnosed with stage I hypertension on 06-01-2018.
Ms. Lee's blood work revealed hyperlipidemia with elevated LDL levels on 06-01-2018.
Ms. Lee was prescribed metformin 1000 mg daily for her diabetes on 06-01-2018.
Ms. Lee's most recent A1C level was 8.5% on 06-15-2020.
Ms. Lee was diagnosed with type 2 diabetes mellitus, with microvascular complications, including diabetic retinopathy, on 09-01-2019.
Ms. Lee's blood pressure remains elevated and she was prescribed lisinopril 10 mg daily on 09-01-2019.
Ms. Lee's most recent lipid panel showed elevated LDL levels, and she was prescribed atorvastatin 40 mg daily on 09-01-2019.
`
    const ehr = await generateElectronicHealthRecord(notes)
    debug(`EHR: ${JSON.stringify(ehr, null, 2)}`)
  }, 120000)
})
