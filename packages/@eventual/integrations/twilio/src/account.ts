import twilio from "twilio";
import { HttpResponse, api, resource } from "@eventual/core";
import type { AddressListInstanceCreateOptions } from "twilio/lib/rest/api/v2010/account/address";
import type { IncomingPhoneNumberListInstanceCreateOptions } from "twilio/lib/rest/api/v2010/account/incomingPhoneNumber";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export const Address = resource("twilio.Address", {
  async create(input: AddressListInstanceCreateOptions) {
    return {
      sid: (await client.addresses.create(input)).sid,
    };
  },
  async update({ newResourceProperties, attributes: address }) {
    const updatedAddress = await client
      .addresses(address.sid)
      .update(newResourceProperties);
    return {
      sid: updatedAddress.sid,
    };
  },
  async delete({ attributes: address }) {
    await client.addresses(address.sid).remove();
  },
  async init(address) {
    return client.addresses.get(address.sid).fetch();
  },
});

export const PhoneNumber = resource("twilio.PhoneNumber", {
  async create(input: IncomingPhoneNumberListInstanceCreateOptions) {
    return {
      sid: (await client.incomingPhoneNumbers.create(input)).sid,
    };
  },
  async update({ newResourceProperties, attributes: address }) {
    const updatedAddress = await client
      .incomingPhoneNumbers(address.sid)
      .update(newResourceProperties);
    return {
      sid: updatedAddress.sid,
    };
  },
  async delete({ attributes: address }) {
    await client.incomingPhoneNumbers(address.sid).remove();
  },
  async init(address) {
    return client.incomingPhoneNumbers.get(address.sid).fetch();
  },
});

export const samGoodwin = Address("Sam Goodwin", {
  customerName: "Sam Goodwin",
  city: "Seattle",
  region: "Seattle",
  postalCode: "98109",
  isoCountry: "US",
  street: "560 Highland Drive",
});

export const samGoodwinCell = PhoneNumber("Sam Goodwin Cell", {
  // PROBLEM: attributes.sid won't exist during infer/synth
  // can use a Proxy to intercept these references, not sure if good idea
  addressSid: samGoodwin.attributes.sid,
  // TODO: where to get this from?
  // This will need to be a ngrok URL when running locally
  // And then the API Gateway URL when deployed
  smsUrl: process.env.SERVER_URL,
});

export const sms = api.post("/sms", (request) => {
  const response = new twilio.twiml.MessagingResponse().message("Hello World");
  return new HttpResponse(response.toString(), {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
});
