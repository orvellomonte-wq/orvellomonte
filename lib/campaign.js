const normalizeMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(2)) : 0;
};

const calculateBuyTwoGetOne = (items = [], active = false) => {
  const unitPrices = [];

  for (const item of items) {
    const price = normalizeMoney(item?.price ?? item?.salePrice);
    const quantity = Math.max(
      0,
      Number.parseInt(item?.quantity ?? item?.qty, 10) || 0
    );

    if (price <= 0 || quantity <= 0) {
      continue;
    }

    for (let index = 0; index < quantity; index += 1) {
      unitPrices.push(price);
    }
  }

  const totalItems = unitPrices.length;
  const freeItemCount = active ? Math.floor(totalItems / 3) : 0;
  const amount = freeItemCount > 0
    ? normalizeMoney(
      unitPrices
        .sort((a, b) => a - b)
        .slice(0, freeItemCount)
        .reduce((sum, price) => sum + price, 0)
    )
    : 0;

  return {
    totalItems,
    freeItemCount,
    amount
  };
};

module.exports = { calculateBuyTwoGetOne };
