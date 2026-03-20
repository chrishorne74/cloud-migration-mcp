import type { CarbonImpactReport, WorkloadInput } from "../types/index.js";

// ─── Carbon intensity constants ───────────────────────────────────────────────
// Source: IEA 2023 global average grid intensity; cloud providers publish
// renewable energy commitments (AWS: 100% RE by 2025, Azure: 100% RE 2025,
// GCP: carbon-free energy 24/7 by 2030).
// Conservative cloud carbon factor: 0.233 kgCO2/kWh (AWS 2023 US-EAST carbon intensity with RE mix)
// On-premises: 0.357 kgCO2/kWh (IEA 2023 world average grid intensity)

const GRID_CARBON_INTENSITY_KG_PER_KWH = 0.357;   // on-premises grid (world average)
const CLOUD_CARBON_INTENSITY_KG_PER_KWH = 0.088;  // cloud hyperscaler (AWS/Azure/GCP with RE commitments)
const DEFAULT_PUE_ON_PREM = 1.58;                  // Uptime Institute 2023 global average datacentre PUE
const CLOUD_PUE = 1.12;                            // AWS/Azure/GCP average PUE (hyperscale efficiency)
const DEFAULT_WATTS_PER_SERVER = 300;              // typical x86 rack server at average utilisation
const HOURS_PER_YEAR = 8_760;
const KG_CO2_PER_KM_CAR = 0.17;                   // average passenger car kg CO2 per km (EPA)

// ─── Main export ──────────────────────────────────────────────────────────────

export function estimateCarbonImpact(workload: WorkloadInput): CarbonImpactReport {
  const notes: string[] = [];

  const serverCount = workload.serverCount ?? 1;
  const wattsPerServer = workload.averageServerWatts ?? DEFAULT_WATTS_PER_SERVER;
  const puE = workload.datacentrePuE ?? DEFAULT_PUE_ON_PREM;

  if (!workload.serverCount) {
    notes.push("Server count not provided — defaulting to 1 server. Provide serverCount for a more accurate estimate.");
  }
  if (!workload.averageServerWatts) {
    notes.push(`Average server power not provided — defaulting to ${DEFAULT_WATTS_PER_SERVER}W (typical x86 rack server at average utilisation).`);
  }
  if (!workload.datacentrePuE) {
    notes.push(`Datacentre PUE not provided — defaulting to ${DEFAULT_PUE_ON_PREM} (Uptime Institute 2023 global average).`);
  }

  // On-premises footprint
  const onPremServerKwh = (serverCount * wattsPerServer * HOURS_PER_YEAR) / 1000;
  const onPremTotalKwh = onPremServerKwh * puE; // includes cooling, power delivery overhead
  const onPremCo2Kg = onPremTotalKwh * GRID_CARBON_INTENSITY_KG_PER_KWH;

  // Cloud footprint — hyperscalers are ~4–5× more energy efficient plus higher RE %
  // Cloud efficiency factor: server consolidation (~1.5–2× utilisation improvement) +
  // hyperscale PUE advantage + renewable energy mix
  const cloudServerKwh = (serverCount * wattsPerServer * HOURS_PER_YEAR) / 1000 / 2.0; // ~2× utilisation improvement
  const cloudTotalKwh = cloudServerKwh * CLOUD_PUE;
  const cloudCo2Kg = cloudTotalKwh * CLOUD_CARBON_INTENSITY_KG_PER_KWH;

  const co2ReductionKg = Math.max(0, onPremCo2Kg - cloudCo2Kg);
  const co2ReductionPct = onPremCo2Kg > 0 ? Math.round((co2ReductionKg / onPremCo2Kg) * 100) : 0;

  // Equivalent car km removed (CO2 saving expressed as car distance equivalent)
  const carKmEquivalent = Math.round(co2ReductionKg / KG_CO2_PER_KM_CAR);

  notes.push(
    "Calculation method: on-premises footprint = (server count × watts × 8,760h × PUE) ÷ 1,000 × grid carbon intensity. " +
    "Cloud footprint uses hyperscale PUE (1.12), 2× utilisation improvement from consolidation, and cloud provider renewable energy carbon intensity (0.088 kgCO2/kWh)."
  );
  notes.push(
    "Sources: IEA World Energy Outlook 2023 (grid carbon intensity); Uptime Institute 2023 Global Data Center Survey (PUE); " +
    "AWS Sustainability Report 2023; Microsoft Sustainability Report 2023; Google Environmental Report 2023."
  );
  notes.push(
    "These are ROM estimates (±40%). For accurate Scope 2 emissions reporting, use cloud provider carbon footprint tools: " +
    "AWS Customer Carbon Footprint Tool, Microsoft Emissions Impact Dashboard, or Google Cloud Carbon Footprint."
  );

  return {
    workloadName: workload.name,
    onPremAnnualKwh: Math.round(onPremTotalKwh),
    onPremAnnualCo2Kg: Math.round(onPremCo2Kg),
    cloudAnnualKwh: Math.round(cloudTotalKwh),
    cloudAnnualCo2Kg: Math.round(cloudCo2Kg),
    co2ReductionKg: Math.round(co2ReductionKg),
    co2ReductionPct,
    equivalentCarKmRemoved: carKmEquivalent,
    notes,
  };
}
