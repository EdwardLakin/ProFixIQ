from pathlib import Path

path = Path("features/shared/types/types/supabase.ts")
text = path.read_text(encoding="utf-8")

inventory_table = '''      inventory_reconciliation_exceptions: {
        Row: {
          created_at: string
          details: Json
          id: string
          missing_quantity: number
          part_id: string | null
          purchase_order_id: string | null
          reason: string
          resolved_at: string | null
          shop_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          missing_quantity: number
          part_id?: string | null
          purchase_order_id?: string | null
          reason: string
          resolved_at?: string | null
          shop_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          missing_quantity?: number
          part_id?: string | null
          purchase_order_id?: string | null
          reason?: string
          resolved_at?: string | null
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reconciliation_exceptions_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "part_stock_summary"
            referencedColumns: ["part_id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_exceptions_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_exceptions_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_exceptions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shop_public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_exceptions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
'''
anchor = "      invoice_documents: {\n"
if "      inventory_reconciliation_exceptions: {\n" not in text:
    if anchor not in text:
        raise RuntimeError("invoice_documents type anchor not found")
    text = text.replace(anchor, inventory_table + anchor, 1)

row_pattern = '''          source_intake_id: string | null
          source_row_id: string | null
          status: string
          template_id: string | null
'''
row_replacement = '''          source_intake_id: string | null
          source_row_id: string | null
          status: string
          technician_notes: string | null
          template_id: string | null
'''
if "          technician_notes: string | null\n" not in text:
    if text.count(row_pattern) != 1:
        raise RuntimeError(f"Expected one work_order_lines Row anchor, found {text.count(row_pattern)}")
    text = text.replace(row_pattern, row_replacement, 1)

write_pattern = '''          source_intake_id?: string | null
          source_row_id?: string | null
          status?: string
          template_id?: string | null
'''
write_replacement = '''          source_intake_id?: string | null
          source_row_id?: string | null
          status?: string
          technician_notes?: string | null
          template_id?: string | null
'''
missing_optional = 2 - text.count("          technician_notes?: string | null\n")
for _ in range(max(0, missing_optional)):
    if write_pattern not in text:
        raise RuntimeError("work_order_lines Insert/Update anchor not found")
    text = text.replace(write_pattern, write_replacement, 1)

canonical_role = '''      canonical_shop_membership_role: {
        Args: { p_role: string }
        Returns: string
      }
'''
anchor = "      chat_participants_key: {\n"
if "      canonical_shop_membership_role: {\n" not in text:
    if anchor not in text:
        raise RuntimeError("chat_participants_key function anchor not found")
    text = text.replace(anchor, canonical_role + anchor, 1)

parts_rpc = '''      parts_create_and_attach_inventory_atomic: {
        Args: {
          p_category: string
          p_cost: number
          p_initial_qty: number
          p_item_id: string
          p_location_id: string
          p_manufacturer: string
          p_name: string
          p_operation_key: string
          p_part_number: string
          p_sell_price: number
          p_sku: string
          p_supplier: string
        }
        Returns: Json
      }
'''
anchor = "      parts_create_or_reuse_po_line_for_request: {\n"
if "      parts_create_and_attach_inventory_atomic: {\n" not in text:
    if anchor not in text:
        raise RuntimeError("parts_create_or_reuse_po_line_for_request function anchor not found")
    text = text.replace(anchor, parts_rpc + anchor, 1)

path.write_text(text, encoding="utf-8")
Path(__file__).unlink(missing_ok=True)
Path(".github/workflows/sync-codex-followup-generated-types.yml").unlink(
    missing_ok=True
)
