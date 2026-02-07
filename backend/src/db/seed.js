import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { getDb, run, get } from "./sqlite.js";

dotenv.config();

async function upsertMember(db, { sap_no, full_name, phone_no, role, password }) {
  const existing = await get(db, "SELECT sap_no FROM members WHERE sap_no = ?", [sap_no]);
  const password_hash = await bcrypt.hash(password, 12);
  if (existing) {
    await run(db, `
      UPDATE members SET full_name=?, phone_no=?, role=?, password_hash=?, updated_at=datetime('now')
      WHERE sap_no=?
    `, [full_name, phone_no, role, password_hash, sap_no]);
    return;
  }
  await run(db, `
    INSERT INTO members (sap_no, full_name, phone_no, role, password_hash)
    VALUES (?, ?, ?, ?, ?)
  `, [sap_no, full_name, phone_no, role, password_hash]);
}

async function addTxn(db, { sap_no, names, date, description, amount, remark }) {
  await run(db, `
    INSERT INTO thrift_loan_repayment (sap_no, names, date, description, amount, remark)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [sap_no, names, date, description, amount, remark || ""]);
}

function iso(d) {
  return d.toISOString().slice(0,10);
}

async function main() {
  const db = getDb();
  try {
    await upsertMember(db, {
      sap_no: "ADMIN001",
      full_name: "System Admin",
      phone_no: "08000000000",
      role: "ADMIN",
      password: "Admin@1234"
    });

    await upsertMember(db, {
      sap_no: "100001",
      full_name: "Amina Yusuf",
      phone_no: "08011112222",
      role: "MEMBER",
      password: "Member@1234"
    });

    await upsertMember(db, {
      sap_no: "100002",
      full_name: "Chinedu Okafor",
      phone_no: "08033334444",
      role: "MEMBER",
      password: "Member@1234"
    });

    // Sample transactions
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth() - 5, 5);

    for (let m = 0; m < 6; m++) {
      const d = new Date(start.getFullYear(), start.getMonth() + m, 5);
      await addTxn(db, { sap_no: "100001", names: "Amina Yusuf", date: iso(d), description: "THRIFT", amount: 10000, remark: "Monthly thrift" });
      await addTxn(db, { sap_no: "100002", names: "Chinedu Okafor", date: iso(d), description: "THRIFT", amount: 8000, remark: "Monthly thrift" });
    }

    // Loan sample for 100001
    await addTxn(db, { sap_no: "100001", names: "Amina Yusuf", date: iso(new Date(today.getFullYear(), today.getMonth()-2, 12)), description: "LOAN_DISBURSEMENT", amount: 200000, remark: "Loan approved" });
    await addTxn(db, { sap_no: "100001", names: "Amina Yusuf", date: iso(new Date(today.getFullYear(), today.getMonth()-1, 12)), description: "LOAN_REPAYMENT", amount: 50000, remark: "Repayment" });
    await addTxn(db, { sap_no: "100001", names: "Amina Yusuf", date: iso(new Date(today.getFullYear(), today.getMonth(), 12)), description: "LOAN_REPAYMENT", amount: 50000, remark: "Repayment" });

    console.log("Seed complete.");
  } finally {
    db.close();
  }
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
