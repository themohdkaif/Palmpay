"use client";

/**
 * Admin Panel: Registered Customer Directory & Biometric Management
 *
 * Security Note:
 * This admin view exposes PII (names, phone numbers, email addresses) for enrolled users.
 * In a production deployment, this route MUST be protected behind strong role-based access control
 * (RBAC) / OAuth2 authentication middleware. It is left unlinked from public navigation.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchCustomers, updateCustomer, deleteCustomer } from "@/lib/api-client";
import { AdminCustomer } from "@/lib/types";

export default function AdminUsersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Edit Modal State
  const [editingCustomer, setEditingCustomer] = useState<AdminCustomer | null>(null);
  const [editForm, setEditForm] = useState({ name: "", contact: "", email: "", upi_vpa: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete Confirmation State
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchCustomers();
      setCustomers(data);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to load customer directory from server.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenEdit(cust: AdminCustomer) {
    setEditingCustomer(cust);
    setEditForm({
      name: cust.name,
      contact: cust.contact,
      email: cust.email || "",
      upi_vpa: cust.upi_vpa,
    });
    setEditError(null);
  }

  function handleCancelEdit() {
    setEditingCustomer(null);
    setEditError(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCustomer) return;

    // Client-side validation
    const cleanPhone = editForm.contact.trim().replace(/\s+/g, "").replace(/-/g, "");
    const phoneNum = cleanPhone.startsWith("+91") ? cleanPhone.slice(3) : cleanPhone;
    if (!/^\d{10}$/.test(phoneNum)) {
      setEditError("Please enter a valid 10-digit Indian mobile number (e.g. 9876543210)");
      return;
    }

    const cleanEmail = editForm.email.trim().toLowerCase();
    if (!cleanEmail.includes("@") || !cleanEmail.split("@")[1]?.includes(".")) {
      setEditError("Please enter a valid email address (e.g. name@example.com)");
      return;
    }

    setIsUpdating(true);
    setEditError(null);
    try {
      const updated = await updateCustomer(editingCustomer.id, {
        name: editForm.name.trim(),
        contact: phoneNum,
        email: cleanEmail,
        upi_vpa: editForm.upi_vpa.trim().toLowerCase(),
      });

      setCustomers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSuccessMessage(`Successfully updated profile for ${updated.name}`);
      setTimeout(() => setSuccessMessage(null), 4000);
      setEditingCustomer(null);
    } catch (err: any) {
      setEditError(err.message || "Failed to update customer profile");
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleConfirmDelete(id: number) {
    setIsDeleting(true);
    try {
      await deleteCustomer(id);
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      setSuccessMessage(`Customer record #${id} and associated palm embeddings permanently deleted.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      setDeletingId(null);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete customer record.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0F1A14] text-[#F1ECDD] font-sans antialiased p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Navigation Breadcrumb & Admin Notice */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[#3A4A3E] pb-4 gap-4">
          <div>
            <div className="flex items-center space-x-3 text-xs tracking-widest text-[#B08D46] font-mono uppercase">
              <span>Vault & Vein Administrative Portal</span>
              <span>·</span>
              <span>Protected Route</span>
            </div>
            <h1 className="font-serif text-3xl md:text-4xl text-[#F1ECDD] font-normal mt-1">
              Enrolled Biometric Identities
            </h1>
          </div>
          <Link
            href="/ledger"
            className="text-xs font-mono text-[#B08D46] hover:text-[#D4AF6A] border border-[#3A4A3E] hover:border-[#B08D46] px-4 py-2 transition-colors uppercase tracking-wider"
          >
            ← View Transaction Ledger
          </Link>
        </div>

        {/* Ledger Summary Line */}
        <div className="bg-[#14241B] border border-[#3A4A3E] p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <span className="font-mono text-2xl text-[#B08D46] font-bold">
              {isLoading ? "..." : customers.length}
            </span>
            <div>
              <p className="text-xs font-mono uppercase text-[#B08D46] tracking-wider">
                REGISTERED CUSTOMER ACCOUNTS
              </p>
              <p className="text-xs text-[#F1ECDD]/70">
                Enrolled palm-vein embeddings active in matching matrix
              </p>
            </div>
          </div>
          <div className="text-xs font-mono text-[#F1ECDD]/50 border-t md:border-t-0 border-[#3A4A3E] pt-2 md:pt-0">
            DPDP Act 2023 Compliant · Hardware HOG/CNN Vector DB
          </div>
        </div>

        {/* Feedback Messages */}
        {successMessage && (
          <div className="bg-[#1B2E23] border border-[#B08D46] text-[#D4AF6A] p-4 text-sm font-mono flex justify-between items-center">
            <span>✓ {successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} className="text-xs opacity-70 hover:opacity-100">✕</button>
          </div>
        )}
        {errorMessage && (
          <div className="bg-[#2A1616] border border-[#7A2E2E] text-[#E0A8A8] p-4 text-sm font-mono flex justify-between items-center">
            <span>⚠ {errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-xs opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* Customer Directory Table */}
        <div className="bg-[#14241B] border border-[#3A4A3E] overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center font-mono text-sm text-[#B08D46] animate-pulse">
              Loading biometric registry data from database...
            </div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center font-mono text-sm text-[#F1ECDD]/60">
              No registered customer records found in database.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-[#3A4A3E] bg-[#0F1A14] text-[#B08D46] uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4 font-normal">ID / Name</th>
                    <th className="py-3 px-4 font-normal">Contact Phone</th>
                    <th className="py-3 px-4 font-normal">Email Address</th>
                    <th className="py-3 px-4 font-normal">UPI VPA</th>
                    <th className="py-3 px-4 font-normal">Embeddings</th>
                    <th className="py-3 px-4 font-normal">Consent</th>
                    <th className="py-3 px-4 font-normal">Mandate</th>
                    <th className="py-3 px-4 font-normal text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3A4A3E]/60 text-[#F1ECDD]">
                  {customers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-[#1B2E23]/60 transition-colors">
                      
                      {/* Name & ID */}
                      <td className="py-4 px-4">
                        <div className="font-serif text-sm text-[#F1ECDD] font-medium">
                          {cust.name}
                        </div>
                        <div className="text-[10px] text-[#B08D46] opacity-80 mt-0.5">
                          ID: #{cust.id} · Enrolled {cust.created_at ? new Date(cust.created_at).toLocaleDateString("en-IN") : "N/A"}
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-4 px-4 font-mono text-[#F1ECDD]/90">
                        +91 {cust.contact}
                      </td>

                      {/* Email */}
                      <td className="py-4 px-4 text-[#F1ECDD]/80">
                        {cust.email || "—"}
                      </td>

                      {/* UPI VPA */}
                      <td className="py-4 px-4 text-[#B08D46]">
                        {cust.masked_upi}
                      </td>

                      {/* Embeddings Count */}
                      <td className="py-4 px-4">
                        <span className="inline-block border border-[#3A4A3E] bg-[#0F1A14] px-2 py-0.5 text-[10px] text-[#D4AF6A]">
                          {cust.embedding_count} vectors
                        </span>
                      </td>

                      {/* Consent */}
                      <td className="py-4 px-4">
                        {cust.consent_given_at ? (
                          <span className="text-[#8FB397] text-[10px] border border-[#3A4A3E] px-2 py-0.5 bg-[#0F1A14]">
                            DPDP ✓ ({cust.consent_version || "v1.0"})
                          </span>
                        ) : (
                          <span className="text-[#E0A8A8] text-[10px] opacity-70">
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Mandate Status */}
                      <td className="py-4 px-4">
                        {cust.mandate_approved ? (
                          <span className="text-[#D4AF6A] text-[10px] border border-[#B08D46]/40 px-2 py-0.5 bg-[#0F1A14]">
                            APPROVED ✓
                          </span>
                        ) : (
                          <span className="text-[#F1ECDD]/50 text-[10px]">
                            Pending App
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEdit(cust)}
                          className="border border-[#3A4A3E] hover:border-[#B08D46] px-2.5 py-1 text-[11px] text-[#B08D46] hover:text-[#D4AF6A] transition-colors"
                        >
                          EDIT
                        </button>
                        <button
                          onClick={() => setDeletingId(cust.id)}
                          className="border border-[#7A2E2E]/60 hover:border-[#7A2E2E] bg-[#2A1616]/40 text-[#E0A8A8] px-2.5 py-1 text-[11px] transition-colors"
                        >
                          DELETE
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Edit Modal Drawer */}
        {editingCustomer && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-[#14241B] border border-[#B08D46] max-w-lg w-full p-6 space-y-6 shadow-2xl">
              
              <div className="border-b border-[#3A4A3E] pb-3 flex justify-between items-center">
                <div>
                  <h3 className="font-serif text-xl text-[#F1ECDD]">
                    Edit Customer Profile #{editingCustomer.id}
                  </h3>
                  <p className="text-xs font-mono text-[#B08D46] mt-0.5">
                    Vault & Vein Identity Record Update
                  </p>
                </div>
                <button
                  onClick={handleCancelEdit}
                  className="text-xs font-mono text-[#F1ECDD]/60 hover:text-[#F1ECDD]"
                >
                  ✕
                </button>
              </div>

              {editError && (
                <div className="bg-[#2A1616] border border-[#7A2E2E] text-[#E0A8A8] p-3 text-xs font-mono">
                  ⚠ {editError}
                </div>
              )}

              <form onSubmit={handleSaveEdit} className="space-y-4 font-mono text-xs">
                <div>
                  <label className="block text-[#B08D46] mb-1 uppercase tracking-wider">
                    Full Legal Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full bg-[#0F1A14] border border-[#3A4A3E] focus:border-[#B08D46] text-[#F1ECDD] px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#B08D46] mb-1 uppercase tracking-wider">
                    10-Digit Mobile Contact (+91)
                  </label>
                  <input
                    type="tel"
                    required
                    value={editForm.contact}
                    onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })}
                    className="w-full bg-[#0F1A14] border border-[#3A4A3E] focus:border-[#B08D46] text-[#F1ECDD] px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#B08D46] mb-1 uppercase tracking-wider">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full bg-[#0F1A14] border border-[#3A4A3E] focus:border-[#B08D46] text-[#F1ECDD] px-3 py-2 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[#B08D46] mb-1 uppercase tracking-wider">
                    UPI VPA (Payment Address)
                  </label>
                  <input
                    type="text"
                    required
                    value={editForm.upi_vpa}
                    onChange={(e) => setEditForm({ ...editForm, upi_vpa: e.target.value })}
                    className="w-full bg-[#0F1A14] border border-[#3A4A3E] focus:border-[#B08D46] text-[#F1ECDD] px-3 py-2 outline-none"
                  />
                </div>

                <div className="pt-4 border-t border-[#3A4A3E] flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={isUpdating}
                    className="border border-[#3A4A3E] hover:border-[#F1ECDD]/40 text-[#F1ECDD]/70 px-4 py-2 uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdating}
                    className="bg-[#B08D46] hover:bg-[#D4AF6A] text-[#0F1A14] font-bold px-5 py-2 uppercase tracking-wider transition-colors disabled:opacity-50"
                  >
                    {isUpdating ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deletingId !== null && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-[#14241B] border border-[#7A2E2E] max-w-md w-full p-6 space-y-5 shadow-2xl">
              <div className="border-b border-[#7A2E2E]/60 pb-3">
                <h3 className="font-serif text-xl text-[#E0A8A8]">
                  Confirm Biometric Record Deletion
                </h3>
                <p className="text-xs font-mono text-[#E0A8A8]/70 mt-0.5">
                  Irreversible Biometric Un-enrollment
                </p>
              </div>

              <p className="text-xs font-mono text-[#F1ECDD]/90 leading-relaxed">
                Are you sure you want to delete customer record <span className="text-[#B08D46]">#{deletingId}</span>? This will permanently remove all associated 128-D palm vector embeddings from the active matcher matrix.
              </p>

              <div className="bg-[#2A1616]/50 border border-[#7A2E2E]/40 p-3 text-[11px] font-mono text-[#E0A8A8]/80 space-y-1">
                <p>• Biometric Palm Scanning: Disabled for this user</p>
                <p>• Ledger History: Preserved for financial audit compliance</p>
              </div>

              <div className="pt-3 border-t border-[#3A4A3E] flex justify-end space-x-3 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => setDeletingId(null)}
                  disabled={isDeleting}
                  className="border border-[#3A4A3E] text-[#F1ECDD]/70 hover:text-[#F1ECDD] px-4 py-2 uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmDelete(deletingId)}
                  disabled={isDeleting}
                  className="bg-[#7A2E2E] hover:bg-[#A33D3D] text-[#F1ECDD] font-bold px-5 py-2 uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
