// @ts-nocheck

export default eventual(
  async ({ accountId, address, email, bankDetails }: OpenAccountRequest) => {
    const rollbacks: RollbackHandler[] = [];

    try {
      await createAccount(accountId);
    } catch (err) {
      console.error(err);
      throw err;
    }

    try {
      await addAddress(accountId, address);
      rollbacks.push(async () => removeAddress(accountId));

      await addEmail(accountId, email);
      rollbacks.push(async () => removeEmail(accountId));

      await addBankAccount(accountId, bankDetails);
      rollbacks.push(async () => removeBankAccount(accountId));
    } catch (err) {
      // roll back procedures are independent of each other, run them in parallel
      await Promise.all(rollbacks.map((rollback) => rollback()));
    }
  }
);
