import React, { useState } from 'react';
import { Plus, Mail, Phone, Building, Trash2, Edit3 } from 'lucide-react';
import { Client } from '../types';

interface ClientsTabProps {
  clients: Client[];
  onAddClient: (client: Partial<Client>) => Promise<void>;
  onUpdateClient?: (clientId: string, updates: Partial<Client>) => Promise<void>;
  onDeleteClient: (clientId: string) => Promise<void>;
}

const INDUSTRY_OPTIONS = [
  'Fintech & Payments',
  'Healthcare / MedTech',
  'Real Estate',
  'E-Commerce & Retail',
  'Marketing & AdTech',
  'SaaS & Cloud Services',
  'Internal Automation',
];

export const ClientsTab: React.FC<ClientsTabProps> = ({
  clients,
  onAddClient,
  onUpdateClient,
  onDeleteClient,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('Fintech & Payments');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setName('');
    setCompanyName('');
    setIndustry('Fintech & Payments');
    setContactEmail('');
    setContactPhone('');
    setNotes('');
    setEditingClient(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setCompanyName(client.companyName);
    setIndustry(client.industry || 'SaaS & Cloud Services');
    setContactEmail(client.contactEmail);
    setContactPhone(client.contactPhone || '');
    setNotes(client.notes || '');
    setShowAddModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !companyName.trim() || !contactEmail.trim()) return;
    if (editingClient && onUpdateClient) {
      await onUpdateClient(editingClient.id, {
        name: name.trim(),
        companyName: companyName.trim(),
        industry,
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    } else {
      await onAddClient({
        name: name.trim(),
        companyName: companyName.trim(),
        industry,
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
    }
    setShowAddModal(false);
    resetForm();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
            Client &amp; Project Portfolios
          </h2>
          <p className="text-xs text-[#B5AA99]">
            Multi-tenant isolated client portfolios, contacts, and automation health scores
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Add New Client</span>
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-10 text-center space-y-3">
          <p className="text-sm font-semibold text-[#E9E5DC]">No client portfolios configured yet</p>
          <p className="text-xs text-[#B5AA99] max-w-md mx-auto">
            Add your first client or internal project portfolio to organize workflows, integrations, and incident ownership.
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Your First Client</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clients.map((client) => (
            <div
              key={client.id}
              className="rounded-xl border border-[#383838] bg-[#202020] p-5 flex flex-col justify-between hover:border-[#B5AA99]/60 transition-colors"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#E9E5DC]">{client.name}</h3>
                    <p className="text-xs text-[#B5AA99] font-medium">{client.companyName}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`font-mono text-base font-bold tabular-nums ${
                        client.healthScore >= 90
                          ? 'text-[#8CC59B]'
                          : client.healthScore >= 70
                          ? 'text-[#E2B066]'
                          : 'text-[#E88A7E]'
                      }`}
                    >
                      {client.healthScore}%
                    </span>
                    <p className="text-[10px] text-[#B5AA99]">Health Score</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-xs text-[#B5AA99]">
                  <div className="flex items-center gap-2">
                    <Building className="h-3.5 w-3.5 text-[#C52A18]" aria-hidden="true" />
                    <span>{client.industry}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-[#B5AA99]" aria-hidden="true" />
                    <span className="text-[#E9E5DC]">{client.contactEmail}</span>
                  </div>
                  {client.contactPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-[#B5AA99]" aria-hidden="true" />
                      <span>{client.contactPhone}</span>
                    </div>
                  )}
                  {client.notes && (
                    <p className="mt-2 rounded-lg border border-[#383838] bg-[#171717] p-2.5 text-[11px] text-[#B5AA99]">
                      {client.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-[#383838] flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 text-[#B5AA99] tabular-nums">
                  <span>{client.monitoredWorkflowsCount} workflows</span>
                  <span aria-hidden="true">·</span>
                  <span className={client.activeIncidentsCount > 0 ? 'text-[#E88A7E] font-semibold' : 'text-[#8CC59B]'}>
                    {client.activeIncidentsCount > 0 ? `${client.activeIncidentsCount} active issue` : 'Operational'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {onUpdateClient && (
                    <button
                      type="button"
                      onClick={() => openEditModal(client)}
                      className="text-[#B5AA99] hover:text-[#E9E5DC] transition-colors p-1"
                      title="Edit Client"
                      aria-label={`Edit ${client.name}`}
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteClient(client.id)}
                    className="text-[#B5AA99] hover:text-[#E88A7E] transition-colors p-1"
                    title="Archive Client"
                    aria-label={`Archive ${client.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-[#383838] bg-[#202020] p-6 shadow-2xl">
            <h3 className="font-[var(--font-display)] text-base font-bold text-[#E9E5DC] mb-4">
              {editingClient ? `Edit Client — ${editingClient.name}` : 'Onboard New Client Portfolio'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Display Client Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Nova Logistics"
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Legal Company Name</label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g., Nova Global Logistics Corp."
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Industry</label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                >
                  {INDUSTRY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Contact Email</label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="operations@novalogistics.com"
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Contact Phone (Optional)</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Operational Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="High webhook load during morning hours..."
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#383838]">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="rounded-md border border-[#383838] bg-[#171717] px-3.5 py-2 text-[#B5AA99] hover:text-[#E9E5DC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 font-semibold text-[#E9E5DC]"
                >
                  {editingClient ? 'Save Client' : 'Create Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
