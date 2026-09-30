// Everything specialty-specific lives here. To tailor the demo to another recruiter's desk,
// edit this file and re-run `npm run seed` (it rebuilds data/demo.db and the recording props).

const demoJob = `Senior Data Engineer — Cobalt Pay (Series C payments platform)
Location: Miami, FL — hybrid 2 days/week (strong remote-US candidates considered)
Comp: $170–190k base + equity

We're rebuilding our transaction data platform. You'll own batch and streaming pipelines that feed risk, finance and merchant reporting.

Must have:
- 6+ years in data engineering
- Spark (or Flink) and Airflow in production
- dbt and a cloud warehouse (Snowflake or BigQuery)
- Kafka or another streaming system

Nice to have:
- Payments, card or ledger data
- Data quality / observability tooling
- Mentoring other engineers`;

export const config = {
  specialty: "tech recruiting for US startups and scale-ups",
  perBatch: 15,
  // One Claude call per entry; each yields `perBatch` fictional candidates focused on this slice.
  roleGroups: [
    "Data engineers (Spark, Airflow, dbt, Snowflake, Kafka). At least 5 based in Florida (Miami, Fort Lauderdale, Tampa, Orlando) and at least 4 with payments or fintech data experience.",
    "Senior and staff data engineers with streaming and warehouse experience; a few in Miami or South Florida, a few remote, a few in New York and Atlanta.",
    "Analytics engineers and data analysts (SQL, dbt, Looker, Python).",
    "Backend engineers (Go, Java, Kotlin).",
    "Backend engineers (Python, Node.js, Postgres).",
    "Frontend engineers (React, TypeScript, design systems).",
    "Full-stack engineers (TypeScript, React, Node, AWS).",
    "DevOps, SRE and platform engineers (Kubernetes, Terraform, AWS/GCP).",
    "Machine learning engineers and data scientists.",
    "Product managers (B2B SaaS, fintech, healthtech).",
    "Engineering managers and directors.",
    "Security engineers (AppSec, cloud security).",
    "Mobile engineers (iOS Swift, Android Kotlin, React Native).",
    "QA automation / SDET and solutions engineers.",
  ],
  clients: [
    { name: "Cobalt Pay", industry: "Payments / fintech" },
    { name: "Northwind Health", industry: "Healthtech" },
    { name: "Brightline Logistics", industry: "Logistics software" },
    { name: "Harbor Analytics", industry: "B2B analytics SaaS" },
    { name: "Fieldstone Energy", industry: "Climate / energy" },
    { name: "Lumen Retail", industry: "E-commerce" },
  ],
  // The demo client, and its Senior Data Engineer job order (also the sample for "New job order").
  demoClient: "Cobalt Pay",
  demoJob,
  // The talent pool search typed in the recording.
  demoSearch: "data engineers in Florida who know Spark and have payments experience, talked to in the last 6 months",
  // The resume dropped on the Cobalt Pay job in the recording: a strong fit, so it ranks #1 among applicants.
  demoResumeBrief:
    "A senior data engineer based in Miami, FL, about 8 years of experience, currently at a fictional payments company, strong in Spark, Airflow, dbt, Snowflake and Kafka, has built transaction reconciliation and fraud-feature pipelines, has mentored two junior engineers, open to hybrid.",

  // The 7 open jobs seeded into the pipeline demo (npm run seed:pipeline). The first two are at
  // Cobalt Pay so a repeat applicant can show up on both (Q10).
  jobs: [
    { client: "Cobalt Pay", title: "Senior Data Engineer", description: demoJob, location: "Miami, FL — hybrid", comp: "$170–190k base + equity" },
    {
      client: "Cobalt Pay",
      title: "Analytics Engineer",
      description: `Analytics Engineer — Cobalt Pay (Series C payments platform)
Location: Miami, FL — hybrid 2 days/week
Comp: $135–155k base + equity

Own the dbt models and Looker dashboards finance and risk teams rely on daily. Partner with data engineering on the warehouse layer.

Must have:
- 3+ years as an analytics engineer or data analyst
- dbt and SQL fluency
- A cloud warehouse (Snowflake or BigQuery)

Nice to have:
- Payments or fintech data
- Looker or a similar BI tool`,
      location: "Miami, FL — hybrid",
      comp: "$135–155k base + equity",
    },
    {
      client: "Northwind Health",
      title: "Backend Engineer (Go)",
      description: `Backend Engineer (Go) — Northwind Health
Location: Remote (US)
Comp: $150–170k base

Build the claims-processing services behind our care-coordination platform. Go, Postgres, and a healthcare data pipeline handling PHI at scale.

Must have:
- 4+ years backend engineering, 2+ in Go
- Postgres and REST/gRPC API design
- Comfort working with HIPAA-regulated data`,
      location: "Remote (US)",
      comp: "$150–170k base",
    },
    {
      client: "Brightline Logistics",
      title: "Site Reliability Engineer",
      description: `Site Reliability Engineer — Brightline Logistics
Location: Atlanta, GA — hybrid
Comp: $160–180k base

Own uptime and on-call for the routing platform that plans freight for our carrier network. Kubernetes, Terraform, and a real incident-response culture.

Must have:
- 4+ years SRE/platform/DevOps
- Kubernetes and Terraform in production
- On-call incident response experience`,
      location: "Atlanta, GA — hybrid",
      comp: "$160–180k base",
    },
    {
      client: "Harbor Analytics",
      title: "Senior Product Manager",
      description: `Senior Product Manager — Harbor Analytics
Location: Remote (US)
Comp: $165–185k base

Own the roadmap for our B2B analytics platform's self-serve reporting suite, working closely with design and a team of six engineers.

Must have:
- 5+ years PM experience, 2+ on a B2B SaaS product
- Track record shipping data or analytics features
- Comfortable running discovery directly with enterprise customers`,
      location: "Remote (US)",
      comp: "$165–185k base",
    },
    {
      client: "Lumen Retail",
      title: "Frontend Engineer",
      description: `Frontend Engineer — Lumen Retail
Location: New York, NY — hybrid
Comp: $140–160k base

Build the checkout and merchandising surfaces for our e-commerce platform. React, TypeScript, and a design system used across a dozen storefronts.

Must have:
- 3+ years frontend engineering
- React and TypeScript in production
- Experience with a component/design system`,
      location: "New York, NY — hybrid",
      comp: "$140–160k base",
    },
    {
      client: "Fieldstone Energy",
      title: "Machine Learning Engineer",
      description: `Machine Learning Engineer — Fieldstone Energy
Location: Remote (US)
Comp: $155–175k base

Build forecasting models for grid demand and renewable output that feed our trading and operations teams.

Must have:
- 3+ years ML engineering or applied data science
- Production experience with forecasting or time-series models
- Python and a modern ML stack`,
      location: "Remote (US)",
      comp: "$155–175k base",
    },
  ],
};
