import { activity, hook, workflow } from "@eventual/core";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

interface PostalAddress {
  address1: string;
  address2?: string;
  postalCode: string;
}
interface BankDetails {
  accountNumber: string;
  accountType: string;
  nickname?: string;
  personalOwner: Owner;
  routingNumber: string;
}
interface Owner {
  firstName: string;
  lastName: string;
}

interface OpenAccountRequest {
  accountId: string;
  address: PostalAddress;
  email: string;
  bankDetails: BankDetails;
}

type RollbackHandler = () => Promise<void>;

export const openAccount = workflow(
  "open-account",
  async (request: OpenAccountRequest) => {
    try {
      await createAccount(request.accountId);
    } catch (err) {
      console.error(err);
      throw err;
    }

    await associateAccountInformation(request);
  }
);

// sub-workflow for testing purposes
export const associateAccountInformation = workflow(
  "associate",
  async ({ accountId, address, email, bankDetails }: OpenAccountRequest) => {
    const rollbacks: RollbackHandler[] = [];
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

// register a web hook API route
hook((api) => {
  api.post("/open-account", async (request) => {
    console.log(request);
    const input = await request.json!();

    const response = await openAccount.startExecution({
      input,
    });

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
      },
      status: 200,
    });
  });
});

const TableName = process.env.TABLE_NAME!;

const dynamo = memoize(() =>
  DynamoDBDocumentClient.from(new DynamoDBClient({}))
);

const createAccount = activity("createAccount", async (accountId: string) => {
  await dynamo().send(
    new PutCommand({
      TableName,
      Item: {
        pk: accountId,
      },
      ConditionExpression: "attribute_not_exists(pk)",
    })
  );
});

const addAddress = activity(
  "addAddress",
  async (accountId: string, address: PostalAddress) => {
    await dynamo().send(
      new UpdateCommand({
        TableName,
        Key: {
          pk: accountId,
        },
        UpdateExpression: "SET #address = :address",
        ExpressionAttributeNames: {
          "#address": "address",
        },
        ExpressionAttributeValues: {
          ":address": address,
        },
        ConditionExpression: "attribute_exists(pk)",
      })
    );
  }
);

const removeAddress = activity("removeAddress", async (accountId: string) => {
  await dynamo().send(
    new UpdateCommand({
      TableName,
      Key: {
        pk: accountId,
      },
      UpdateExpression: "REMOVE #address = :address",
      ExpressionAttributeNames: {
        "#address": "address",
      },
      ConditionExpression: "attribute_exists(pk)",
    })
  );
});

const addEmail = activity(
  "addEmail",
  async (accountId: string, email: string) => {
    await dynamo().send(
      new UpdateCommand({
        TableName,
        Key: {
          pk: accountId,
        },
        UpdateExpression: "SET #email = :email",
        ExpressionAttributeNames: {
          "#email": "email",
        },
        ExpressionAttributeValues: {
          ":email": email,
        },
        ConditionExpression: "attribute_exists(pk)",
      })
    );
  }
);

const removeEmail = activity("removeEmail", async (accountId: string) => {
  await dynamo().send(
    new UpdateCommand({
      TableName,
      Key: {
        pk: accountId,
      },
      UpdateExpression: "REMOVE #email = :email",
      ExpressionAttributeNames: {
        "#email": "email",
      },
      ConditionExpression: "attribute_exists(pk)",
    })
  );
});

const addBankAccount = activity(
  "addBankAccount",
  async (accountId: string, bankDetails: BankDetails) => {
    await dynamo().send(
      new UpdateCommand({
        TableName,
        Key: {
          pk: accountId,
        },
        UpdateExpression: "SET #bankDetails = :bankDetails",
        ExpressionAttributeNames: {
          "#bankDetails": "bankDetails",
        },
        ExpressionAttributeValues: {
          ":bankDetails": bankDetails,
        },
        ConditionExpression: "attribute_exists(pk)",
      })
    );
  }
);

const removeBankAccount = activity(
  "removeBankAccount",
  async (accountId: string) => {
    await dynamo().send(
      new UpdateCommand({
        TableName,
        Key: {
          pk: accountId,
        },
        UpdateExpression: "REMOVE #bankDetails = :bankDetails",
        ExpressionAttributeNames: {
          "#bankDetails": "bankDetails",
        },
        ConditionExpression: "attribute_exists(pk)",
      })
    );
  }
);

function memoize<T>(f: () => T): () => T {
  let isInit = false;
  let value: T | undefined;
  return () => {
    if (!isInit) {
      isInit = true;
      value = f();
    }
    return value!;
  };
}
