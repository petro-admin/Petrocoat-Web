export interface ScopeOfWorkRow {
  slNo: number;
  surfacePreparationCode: number | null;
  surfacePreparationName?: string; // display-only, for the dropdown label
  specialRequirement: string;
  unitCode: number | null;
  unitDesc?: string;
  scopeOfWorkAsPerJobCard: number;
  areaCompleted: number;
  manhourEngaged: number;
  achievedRate: number;
  achievedRateForEachActivity: number;
  totalAreaCompleted: number;
  balanceToComplete: number;
}

export interface MaterialRow {
  slNo: number;
  materialCode: number | null;
  materialName?: string;
  packSize: string;
  unit: string;
  totalMaterialEstimatedQty: number;
  materialReceivedTodayAtSite: number;
  todayConsumed: number;
  balanceAtSite: number;
  area: number;
  rateOfApplication: number;
  areaSupposedToCover: number;
  todayMaterialsUsed: number;
  balanceMaterials: number;
  remarks: string;
  BgColor: string;
  baseUnitCode: number | null;
  baseUnitDesc?: string; // display-only, for the dropdown label
}

export interface ConsumableMachineryRow {
  slNo: number;
  consumableCode: number | null;
  consumableName?: string;
  quantity: number;
  usedToday: number;
  totalConsumablesUsed: number;
  toolsAndEquipmentCode: number | null;
  toolsAndEquipmentName?: string;
  estimatedQuantity: number;
  availableToolsOrMachineryAtSite: number;
  noOfMachineUsedAtSite: number;
  noOfDaysUsedAtSite: number;
  noOfMachineryIdleAtSite: number;
  statusCode: number | null;
  BgColor: string;
  baseUnitCode: number | null;
  baseUnitDesc?: string; // display-only, for the dropdown label
  direct?: number; // 1 = manually added (editable Quantity), 0/undefined = Estimation-wise

}

export interface DailySiteSavePayload {
  dailySiteCode: number;
  docNo: string;
  docNoRev: string;
  docDate: string;
  clientCode: number;
  jobCode: number;
  startDate: string  | null;
  finishDate: string | null;
  location: string;
  project: string;
  startTime: string | null;
  closeTime: string | null;
  supervisor: number;
  preparedBy: number;
  engineer: number;
  scopeOfWorkCode: string;
  scopeOfWork: ScopeOfWorkRow[];
  material: MaterialRow[];
  consumablesAndMachineries: ConsumableMachineryRow[];
  consumables: ConsumableMachineryRow[];
  machineries: ConsumableMachineryRow[];
  consumablesDR: ConsumableMachineryRow[];
  branchHrs: any[];
  scopeManhours: number;
  todayManhours: number;
  previousManhours: number;
  grandTotalManhours: number;
  balanceManhours: number;
  todayManhoursPerc: number;
  previousManhoursPerc: number;
  grandTotalManhoursPerc: number;
  balanceManhoursPerc: number;
  excessPerc: number;
  excess: string;
  remarks: string;
  minHrs: string;
  withoutMaterial: string;
  exsistSoCode: number;
  mode: number; // 0 = insert, 1 = update, 2 = delete
}
