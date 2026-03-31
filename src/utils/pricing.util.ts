interface PriceParams {
  roomPrice: number;
  checkin: Date;
  checkout: Date;
  adults: number;
  baseOccupancy: number;
  extraPersonRate: number;
  planType: 'EP' | 'CP' | 'MAP' | 'AP' | 'custom';
  mealRates: Record<string, number>;
  mealRateOverride?: number;
  gstRates: {
    cgst: number;
    sgst: number;
  };
}

export const calculateBookingPrice = (params: PriceParams) => {
  const diffTime = Math.abs(params.checkout.getTime() - params.checkin.getTime());
  const nights = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  const baseFare = params.roomPrice * nights;
  
  const extraPersons = Math.max(0, params.adults - params.baseOccupancy);
  const extraPersonCharge = extraPersons * params.extraPersonRate * nights;
  
  let mealChargePerPersonPerDay = 0;
  if (params.mealRateOverride !== undefined) {
    mealChargePerPersonPerDay = params.mealRateOverride;
  } else {
    const plan = params.planType.toUpperCase();
    if (plan !== 'EP' && plan !== 'CUSTOM') {
      mealChargePerPersonPerDay = params.mealRates[plan] || params.mealRates[plan.toLowerCase()] || 0;
    }
  }
  
  const mealChargeTotal = mealChargePerPersonPerDay * params.adults * nights;
  
  const subtotal = baseFare + extraPersonCharge + mealChargeTotal;
  
  const cgst = Math.round((subtotal * params.gstRates.cgst) / 100);
  const sgst = Math.round((subtotal * params.gstRates.sgst) / 100);
  
  const grandTotal = Math.round(subtotal + cgst + sgst);
  
  return {
    nights,
    baseFare: Math.round(baseFare),
    extraPersonCharge: Math.round(extraPersonCharge),
    mealChargeTotal: Math.round(mealChargeTotal),
    subtotal: Math.round(subtotal),
    cgst,
    sgst,
    grandTotal
  };
};
