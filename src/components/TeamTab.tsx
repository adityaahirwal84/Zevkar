import React, { useState } from 'react';
import { Plus, CheckCircle2, Copy, Check, Trash2, Mail } from 'lucide-react';
import { AgencyMember, InvitationItem, Role } from '../types';
import { StatusBadge } from './marketing/StatusBadge';

interface TeamTabProps {
  members: AgencyMember[];
  invitations?: InvitationItem[];
  currentUserRole?: Role;
  onInviteMember: (email: string, name: string, role: Role) => Promise<void>;
  onUpdateMemberRole?: (memberId: string, role: Role) => Promise<void>;
  onRemoveMember?: (memberId: string) => Promise<void>;
  onRevokeInvitation?: (invitationId: string) => Promise<void>;
}

export const TeamTab: React.FC<TeamTabProps> = ({
  members,
  invitations = [],
  currentUserRole = 'OWNER',
  onInviteMember,
  onUpdateMemberRole,
  onRemoveMember,
  onRevokeInvitation,
}) => {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [copiedInvId, setCopiedInvId] = useState<string | null>(null);

  const canManageTeam = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';
  const pendingInvitations = invitations.filter((inv) => inv.status === 'PENDING');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    await onInviteMember(email.trim(), name.trim(), role);
    setShowInviteModal(false);
    setEmail('');
    setName('');
  };

  const handleCopyInviteLink = (inv: InvitationItem) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const inviteUrl = `${origin}/accept-invite?token=${encodeURIComponent(inv.token)}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedInvId(inv.id);
    setTimeout(() => setCopiedInvId(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-display)] text-xl font-bold text-[#E9E5DC] tracking-tight">
            Workspace Team &amp; Access Control
          </h2>
          <p className="text-xs text-[#B5AA99]">
            Role-Based Access Control (RBAC): OWNER, ADMIN, MEMBER, and VIEWER permissions
          </p>
        </div>

        {canManageTeam && (
          <button
            type="button"
            onClick={() => setShowInviteModal(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-3.5 py-2 text-xs font-semibold text-[#E9E5DC] transition-colors"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Invite Team Member</span>
          </button>
        )}
      </div>

      <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-3">
        {members.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#B5AA99]">
            No team members loaded yet.
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="rounded-lg border border-[#383838] bg-[#171717] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md border border-[#383838] bg-[#211D10] flex items-center justify-center text-[#E9E5DC] font-bold text-xs shrink-0">
                  {member.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-[#E9E5DC]">{member.name}</h4>
                    <StatusBadge
                      label={member.role}
                      tone={member.role === 'OWNER' ? 'accent' : member.role === 'ADMIN' ? 'warning' : 'neutral'}
                    />
                  </div>
                  <p className="text-xs text-[#B5AA99] mt-0.5">{member.email}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-[#B5AA99]">
                <span className="inline-flex items-center gap-1 text-[#8CC59B] font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{member.status}</span>
                </span>
                <span className="tabular-nums">Joined: {new Date(member.joinedAt).toLocaleDateString()}</span>

                {canManageTeam && member.role !== 'OWNER' && onUpdateMemberRole && (
                  <select
                    aria-label={`Role for ${member.name}`}
                    value={member.role}
                    onChange={(e) => onUpdateMemberRole(member.id, e.target.value as Role)}
                    className="rounded-md border border-[#383838] bg-[#202020] px-2.5 py-1 text-xs text-[#E9E5DC]"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="MEMBER">MEMBER</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                )}

                {canManageTeam && member.role !== 'OWNER' && onRemoveMember && (
                  <button
                    type="button"
                    onClick={() => onRemoveMember(member.userId)}
                    className="text-[#B5AA99] hover:text-[#E88A7E] p-1 transition-colors"
                    title="Remove team member"
                    aria-label={`Remove ${member.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="rounded-xl border border-[#383838] bg-[#202020] p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#383838]">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-[#C52A18]" aria-hidden="true" />
              <h3 className="text-sm font-bold text-[#E9E5DC]">Pending Invitations</h3>
            </div>
            <span className="font-mono text-xs text-[#B5AA99] tabular-nums">
              {pendingInvitations.length} active
            </span>
          </div>

          <div className="space-y-2.5">
            {pendingInvitations.map((inv) => (
              <div
                key={inv.id}
                className="rounded-lg border border-[#383838] bg-[#171717] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#E9E5DC]">{inv.email}</span>
                    <StatusBadge label={inv.role} tone="warning" />
                  </div>
                  <p className="text-[11px] text-[#B5AA99] mt-0.5 tabular-nums">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyInviteLink(inv)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[#383838] bg-[#202020] hover:border-[#B5AA99] px-2.5 py-1.5 text-[11px] font-semibold text-[#E9E5DC]"
                  >
                    {copiedInvId === inv.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#8CC59B]" aria-hidden="true" />
                        <span>Copied Invite Link</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Copy Invite Link</span>
                      </>
                    )}
                  </button>

                  {canManageTeam && onRevokeInvitation && (
                    <button
                      type="button"
                      onClick={() => onRevokeInvitation(inv.id)}
                      className="rounded-md border border-[#61231C] bg-[#2B1513] hover:bg-[#3A1B18] px-2.5 py-1.5 text-[11px] font-semibold text-[#E88A7E]"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-[#383838] bg-[#202020] p-6 shadow-2xl">
            <h3 className="font-[var(--font-display)] text-base font-bold text-[#E9E5DC] mb-4">
              Invite Workspace Engineer
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Sarah Jenkins"
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="s.jenkins@agency.io"
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                />
              </div>

              <div>
                <label className="block text-[#E9E5DC] font-semibold mb-1">Role &amp; Permissions</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full rounded-md border border-[#383838] bg-[#171717] px-3 py-2 text-[#E9E5DC]"
                >
                  <option value="ADMIN">ADMIN — Full management, approvals &amp; recovery</option>
                  <option value="MEMBER">MEMBER — Incident inspection &amp; safe retries</option>
                  <option value="VIEWER">VIEWER — Read-only client health dashboards</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#383838]">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="rounded-md border border-[#383838] bg-[#171717] px-3.5 py-2 text-[#B5AA99] hover:text-[#E9E5DC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#A51B0B] hover:bg-[#C52A18] px-4 py-2 font-semibold text-[#E9E5DC]"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
