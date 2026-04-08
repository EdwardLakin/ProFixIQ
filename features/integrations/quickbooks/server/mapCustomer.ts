import type { CustomerRow } from "../types";

function joinedName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ").trim();
}

export function getQuickBooksCustomerDisplayName(
  customer: Pick<
    CustomerRow,
    | "business_name"
    | "name"
    | "first_name"
    | "last_name"
    | "email"
    | "id"
  >,
): string {
  return (
    customer.business_name?.trim() ||
    customer.name?.trim() ||
    joinedName(customer.first_name, customer.last_name) ||
    customer.email?.trim() ||
    `Customer ${customer.id.slice(0, 8)}`
  );
}

export function mapCustomerToQuickBooksPayload(
  customer: Pick<
    CustomerRow,
    | "business_name"
    | "name"
    | "first_name"
    | "last_name"
    | "email"
    | "phone"
    | "phone_number"
    | "street"
    | "city"
    | "province"
    | "postal_code"
    | "notes"
    | "id"
  >,
) {
  const displayName = getQuickBooksCustomerDisplayName(customer);
  const givenName = customer.first_name?.trim() || undefined;
  const familyName = customer.last_name?.trim() || undefined;
  const primaryPhone =
    customer.phone_number?.trim() || customer.phone?.trim() || undefined;

  return {
    DisplayName: displayName,
    CompanyName: customer.business_name?.trim() || undefined,
    GivenName: givenName,
    FamilyName: familyName,
    PrimaryEmailAddr: customer.email?.trim()
      ? { Address: customer.email.trim() }
      : undefined,
    PrimaryPhone: primaryPhone ? { FreeFormNumber: primaryPhone } : undefined,
    BillAddr:
      customer.street?.trim() ||
      customer.city?.trim() ||
      customer.province?.trim() ||
      customer.postal_code?.trim()
        ? {
            Line1: customer.street?.trim() || undefined,
            City: customer.city?.trim() || undefined,
            CountrySubDivisionCode: customer.province?.trim() || undefined,
            PostalCode: customer.postal_code?.trim() || undefined,
          }
        : undefined,
    Notes: customer.notes?.trim() || undefined,
  };
}