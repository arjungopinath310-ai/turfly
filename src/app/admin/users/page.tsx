import { pageUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatIst } from "@/lib/time";
import { ActionForm } from "@/components/ActionForm";
import { updateUser } from "../actions";

export default async function Users({ searchParams }: { searchParams: { q?: string; role?: string } }) {
  await pageUser("/admin/users", ["ADMIN"]);
  const q = searchParams.q?.trim();
  const users = await prisma.user.findMany({
    where: {
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
      ...(searchParams.role ? { role: searchParams.role as never } : {}),
    },
    include: { _count: { select: { bookings: true, ownedTurfs: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <div className="card overflow-x-auto p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="h1 mr-auto">Users</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Name / phone / email" className="input py-1.5" />
          <select name="role" defaultValue={searchParams.role ?? ""} className="input py-1.5"><option value="">All roles</option><option>PLAYER</option><option>OWNER</option><option>ADMIN</option></select>
          <button className="btn-ghost btn-sm">Filter</button>
        </form>
      </div>
      <table className="table min-w-[760px]">
        <thead><tr><th>User</th><th>Joined</th><th>Bookings</th><th>Turfs</th><th>Role & access</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><b>{u.name ?? "—"}</b><div className="text-xs text-slate-500">{u.phone} {u.email}</div></td>
              <td className="text-xs">{formatIst(u.createdAt, { dateStyle: "medium" })}</td>
              <td>{u._count.bookings}</td>
              <td>{u._count.ownedTurfs}</td>
              <td>
                <ActionForm action={updateUser} className="flex items-center gap-2" submit="Save" submitClass="btn-ghost btn-sm">
                  <input type="hidden" name="userId" value={u.id} />
                  <select name="role" defaultValue={u.role} className="input w-28 py-1"><option>PLAYER</option><option>OWNER</option><option>ADMIN</option></select>
                  <label className="flex items-center gap-1 text-xs text-red-600"><input type="checkbox" name="suspended" defaultChecked={u.isSuspended} /> suspended</label>
                </ActionForm>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
