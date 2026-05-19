import dotenv from 'dotenv';

dotenv.config();

const requiredEnv = ['SESSION_SECRET', 'ADMIN_USER', 'ADMIN_PASSWORD'];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${key}`);
  }
}

export const config = {
  port: Number(process.env.PORT || 3000),
  sessionSecret: process.env.SESSION_SECRET,
  adminUser: process.env.ADMIN_USER,
  adminPassword: process.env.ADMIN_PASSWORD,
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 100)
};
