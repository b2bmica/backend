interface PriceParams {
  roomPrice: number;
  checkin: Date;
  checkout: Date;
  adults: number;
  baseOccupancy: number;
  extraPersonRate: number;
  planType: 'EP' | 'CP' | 'MAP' | 'AP' | 'custom';
  mealRates: {
    cp: number;
    map: number;
    ap: number;
  };
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
  const plan = params.planType.toLowerCase();
  if (plan === 'cp') mealChargePerPersonPerDay = params.mealRates.cp;
  else if (plan === 'map') mealChargePerPersonPerDay = params.mealRates.map;
  else if (plan === 'ap') mealChargePerPersonPerDay = params.mealRates.ap;
  
  const mealChargeTotal = mealChargePerPersonPerDay * params.adults * nights;
  
  const subtotal = baseFare + extraPersonCharge + mealChargeTotal;
  
  const cgst = (subtotal * params.gstRates.cgst) / 100;
  const sgst = (subtotal * params.gstRates.sgst) / 100;
  
  const grandTotal = subtotal + cgst + sgst;
  
  return {
    nights,
    baseFare,
    extraPersonCharge,
    mealChargeTotal,
    subtotal,
    cgst,
    sgst,
    grandTotal
  };
};
