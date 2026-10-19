import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import Traveller from '../src/models/Traveller.js';
import AuthSession from '../src/models/AuthSession.js';
import Admin from '../src/models/Admin.js';
import VehiclePricing from '../src/models/VehiclePricing.js';
import authRoutes from '../src/routes/auth.routes.js';
import adminRoutes from '../src/routes/admin.routes.js';
import { hashPassword, seedAdmin, createAdminToken } from '../src/services/adminAuth.service.js';

// Real route handlers and cryptography with isolated in-memory persistence doubles.
test('server authentication and role/session boundaries', async t => {
  const restore = [];
  const replace = (object, key, value) => { const old = Object.getOwnPropertyDescriptor(object,key); Object.defineProperty(object,key,{configurable:true,writable:true,value}); restore.push(()=>old?Object.defineProperty(object,key,old):delete object[key]); };
  const travellers = new Map(), sessions = new Map();
  const password='Temporary-test-password-2026!';
  const hash=hashPassword(password);
  const admin={_id:new mongoose.Types.ObjectId(),name:'Existing admin',email:'admin@test.invalid',passwordSalt:hash.salt,passwordHash:hash.hash,role:'admin'};
  replace(mongoose.connection,'readyState',1);replace(mongoose.connection,'name','ceylongo');
  replace(Traveller,'create',async data=>{if([...travellers.values()].some(u=>u.email===data.email))throw Object.assign(new Error('duplicate'),{code:11000});const u={...data,_id:new mongoose.Types.ObjectId()};travellers.set(String(u._id),u);return u;});
  replace(Traveller,'findOne',({email})=>({select:async()=>[...travellers.values()].find(u=>u.email===email)||null}));
  replace(Traveller,'findById',id=>({select:async()=>travellers.get(String(id))||null}));
  replace(AuthSession,'create',async data=>{sessions.set(data.tokenHash,data);return data;});
  replace(AuthSession,'findOne',async q=>{const s=sessions.get(q.tokenHash);return s&&s.expiresAt>q.expiresAt.$gt?s:null;});
  replace(AuthSession,'deleteOne',async q=>({deletedCount:sessions.delete(q.tokenHash)?1:0}));
  replace(Admin,'findOne',async q=>q.email===admin.email?admin:null);
  replace(Admin,'findById',id=>({select:async()=>String(id)===String(admin._id)?admin:null}));
  replace(VehiclePricing,'find',()=>({lean:async()=>[]}));
  const app=express();app.use(express.json());app.use('/api/auth',authRoutes);app.use('/api/admin',adminRoutes);
  const send=(path,body,cookie)=>{const r=request(app).post(path).set('Origin','http://localhost:8081');if(cookie)r.set('Cookie',cookie);return r.send(body);};
  const get=(path,cookie)=>{const r=request(app).get(path).set('Origin','http://localhost:8081');if(cookie)r.set('Cookie',cookie);return r;};
  const body={name:'Temporary traveller',email:'traveller@test.invalid',password};let cookie,id;
  try {
    await t.test('register hashes password, issues HttpOnly session and never assigns requested admin role',async()=>{const r=await send('/api/auth/register',{...body,role:'admin'});assert.equal(r.status,201);assert.equal(r.body.user.role,'traveller');id=r.body.user.id;assert.notEqual(travellers.get(id).passwordHash,password);assert.equal(r.body.token,undefined);assert.match(r.headers['set-cookie'][0],/HttpOnly/);assert.match(r.headers['set-cookie'][0],/SameSite=Strict/);cookie=r.headers['set-cookie'][0].split(';')[0];assert.ok(![...sessions.keys()].includes(cookie.split('=')[1]));});
    await t.test('duplicate registration is rejected',async()=>assert.equal((await send('/api/auth/register',body)).status,409));
    await t.test('short new passwords are rejected',async()=>assert.equal((await send('/api/auth/register',{...body,password:'short'})).status,400));
    await t.test('session restores identity without credentials',async()=>{const r=await get('/api/auth/session',cookie);assert.equal(r.status,200);assert.equal(r.body.user.id,id);assert.equal(r.body.user.passwordHash,undefined);});
    await t.test('traveller cookie cannot read or update admin pricing',async()=>{assert.equal((await get('/api/admin/vehicle-pricing',cookie)).status,401);assert.equal((await request(app).put('/api/admin/vehicle-pricing/test').set('Cookie',cookie).send({})).status,401);});
    await t.test('incorrect and unknown credentials fail',async()=>{assert.equal((await send('/api/auth/login',{...body,password:'wrong-password'})).status,401);assert.equal((await send('/api/auth/login',{...body,email:'unknown@test.invalid'})).status,401);});
    await t.test('valid login rotates the old session',async()=>{const old=cookie;const r=await send('/api/auth/login',body,cookie);assert.equal(r.status,200);cookie=r.headers['set-cookie'][0].split(';')[0];assert.notEqual(cookie,old);assert.equal((await get('/api/auth/session',old)).status,401);});
    await t.test('logout revokes server session and expires cookie',async()=>{const r=await send('/api/auth/logout',{},cookie);assert.equal(r.status,200);assert.match(r.headers['set-cookie'][0],/Expires=Thu, 01 Jan 1970/);assert.equal((await get('/api/auth/session',cookie)).status,401);});
    await t.test('expired, invalid and absent sessions fail',async()=>{const r=await send('/api/auth/login',body);cookie=r.headers['set-cookie'][0].split(';')[0];for(const s of sessions.values())s.expiresAt=new Date(0);assert.equal((await get('/api/auth/session',cookie)).status,401);assert.equal((await get('/api/auth/session','ceylongo_session=invalid')).status,401);assert.equal((await get('/api/auth/session')).status,401);});
    await t.test('foreign origins and form CSRF requests fail',async()=>{assert.equal((await request(app).post('/api/auth/login').set('Origin','https://evil.invalid').send(body)).status,403);assert.equal((await request(app).post('/api/auth/logout').type('form').send({})).status,415);});
    await t.test('existing admin credentials issue an admin session and authorize pricing',async()=>{const r=await send('/api/admin/login',{email:admin.email,password});assert.equal(r.status,200);assert.equal(r.body.user.role,'admin');assert.equal(r.body.token,undefined);const c=r.headers['set-cookie'][0].split(';')[0];assert.equal((await get('/api/admin/vehicle-pricing',c)).status,200);await send('/api/auth/logout',{},c);assert.equal((await get('/api/admin/vehicle-pricing',c)).status,401);});
    await t.test('native session token is server-revocable and cannot enter admin routes',async()=>{const r=await request(app).post('/api/auth/login').set('X-CeylonGo-Client','native').send(body);assert.equal(r.status,200);assert.match(r.body.token,/^[a-f0-9]{64}$/);const bearer=`Bearer ${r.body.token}`;assert.equal((await request(app).get('/api/auth/session').set('Authorization',bearer)).status,200);assert.equal((await request(app).get('/api/admin/vehicle-pricing').set('Authorization',bearer)).status,401);await request(app).post('/api/auth/logout').set('Authorization',bearer).send({});assert.equal((await request(app).get('/api/auth/session').set('Authorization',bearer)).status,401);});
    await t.test('existing signed admin bearer tokens retain their original authorization',async()=>{const token=createAdminToken(admin);assert.equal((await request(app).get('/api/admin/vehicle-pricing').set('Authorization',`Bearer ${token}`)).status,200);});
    await t.test('admin password fails in traveller login',async()=>assert.equal((await send('/api/auth/login',{email:admin.email,password})).status,401));
    await t.test('empty administrator configuration creates no account',async()=>{const email=process.env.ADMIN_EMAIL,pass=process.env.ADMIN_PASSWORD;process.env.ADMIN_EMAIL='';process.env.ADMIN_PASSWORD='';let writes=0;replace(Admin,'create',async()=>{writes++;});try{await seedAdmin();assert.equal(writes,0);}finally{if(email===undefined)delete process.env.ADMIN_EMAIL;else process.env.ADMIN_EMAIL=email;if(pass===undefined)delete process.env.ADMIN_PASSWORD;else process.env.ADMIN_PASSWORD=pass;}});
    await t.test('wrong database fails closed before account writes',async()=>{mongoose.connection.name='amazing_green';assert.equal((await send('/api/auth/register',{...body,email:'other@test.invalid'})).status,503);mongoose.connection.name='ceylongo';});
  } finally {restore.reverse().forEach(fn=>fn());}
});
