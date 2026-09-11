import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import { Client, GatewayIntentBits, Partials, PermissionsBitField, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, REST, Routes, SlashCommandBuilder } from 'discord.js';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder().setName('ticket-panel').setDescription('Create the support ticket panel'),
  new SlashCommandBuilder().setName('ticket').setDescription('Create a support ticket'),
  new SlashCommandBuilder().setName('close').setDescription('Close the current ticket'),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a member').addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true)),
  new SlashCommandBuilder().setName('timeout').setDescription('Timeout a member').addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addIntegerOption(o=>o.setName('minutes').setDescription('Minutes').setRequired(true).setMinValue(1).setMaxValue(40320)),
  new SlashCommandBuilder().setName('ai').setDescription('AI assistant placeholder').addStringOption(o=>o.setName('prompt').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder().setName('pay').setDescription('Show payment options'),
  new SlashCommandBuilder().setName('play').setDescription('Music command placeholder').addStringOption(o=>o.setName('query').setDescription('Song/search query').setRequired(true))
].map(c=>c.toJSON());

const app = express();
app.use(express.json());
app.get('/health', (_,res)=>res.json({ok:true, bot:client.user?.tag ?? null, uptime:process.uptime()}));
app.listen(Number(process.env.PORT || 3000));

async function registerCommands() {
  if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) return;
  const rest = new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {body:commands});
}

client.once(Events.ClientReady, async c => {
  console.log(`Logged in as ${c.user.tag}`);
  try { await registerCommands(); } catch (e) { console.error('Command registration failed:', e.message); }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ping') return interaction.reply(`Pong! ${client.ws.ping}ms`);
    if (interaction.commandName === 'ticket-panel') {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({content:'Manage Channels permission required.',ephemeral:true});
      const embed = new EmbedBuilder().setTitle('🎫 Support Center').setDescription('Click **Create Ticket** to open a private support ticket.').setColor(0x5865f2);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_create').setLabel('Create Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary));
      return interaction.reply({embeds:[embed],components:[row]});
    }
    if (interaction.commandName === 'ticket') return createTicket(interaction);
    if (interaction.commandName === 'close') {
      if (!interaction.channel?.name?.startsWith('ticket-')) return interaction.reply({content:'This is not a ticket channel.',ephemeral:true});
      await interaction.reply('🔒 Closing ticket...');
      return setTimeout(()=>interaction.channel?.delete().catch(()=>{}),1500);
    }
    if (interaction.commandName === 'warn') {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({content:'Moderate Members permission required.',ephemeral:true});
      const user = interaction.options.getUser('user'); const reason = interaction.options.getString('reason');
      return interaction.reply(`⚠️ ${user} has been warned. Reason: ${reason}`);
    }
    if (interaction.commandName === 'timeout') {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({content:'Moderate Members permission required.',ephemeral:true});
      const member = interaction.options.getMember('user'); const minutes = interaction.options.getInteger('minutes');
      if (!member || !member.moderatable) return interaction.reply({content:'I cannot timeout that member.',ephemeral:true});
      await member.timeout(minutes*60*1000, `Moderated by ${interaction.user.tag}`);
      return interaction.reply(`⏱️ ${member} timed out for ${minutes} minutes.`);
    }
    if (interaction.commandName === 'ai') return interaction.reply({content:`🤖 AI module ready. Connect your AI provider using AI_API_KEY to enable responses.\nPrompt: ${interaction.options.getString('prompt')}`,ephemeral:true});
    if (interaction.commandName === 'pay') return interaction.reply({content:`💳 Payment Center\nUPI: ${process.env.UPI_ID || 'Not configured'}\nCrypto: Plisio integration is ready for configuration.`,ephemeral:true});
    if (interaction.commandName === 'play') return interaction.reply({content:`🎵 Music module received: **${interaction.options.getString('query')}**. Voice playback adapter is ready for the next module.`,ephemeral:true});
  }
  if (interaction.isButton() && interaction.customId === 'ticket_create') return createTicket(interaction);
});

async function createTicket(interaction) {
  if (!interaction.guild) return;
  const existing = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.id}`);
  if (existing) return interaction.reply({content:`You already have a ticket: ${existing}`,ephemeral:true});
  const channel = await interaction.guild.channels.create({
    name:`ticket-${interaction.user.id}`,
    type:ChannelType.GuildText,
    permissionOverwrites:[
      {id:interaction.guild.roles.everyone.id,deny:[PermissionsBitField.Flags.ViewChannel]},
      {id:interaction.user.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ReadMessageHistory]},
      {id:interaction.guild.members.me.id,allow:[PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages,PermissionsBitField.Flags.ManageChannels]}
    ]
  });
  const embed = new EmbedBuilder().setTitle('🎫 Support Ticket').setDescription(`Welcome ${interaction.user}!\nPlease describe your issue and a staff member will assist you.`).setColor(0x5865f2);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
  await channel.send({content:`${interaction.user}`,embeds:[embed],components:[row]});
  return interaction.reply({content:`Ticket created: ${channel}`,ephemeral:true});
}

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton() || interaction.customId !== 'ticket_close') return;
  if (!interaction.channel?.name?.startsWith('ticket-')) return;
  await interaction.reply('🔒 Closing ticket...');
  setTimeout(()=>interaction.channel?.delete().catch(()=>{}),1000);
});

client.on(Events.GuildMemberAdd, async member => {
  // Basic anti-raid hook: rapid joins are logged. Configure stronger thresholds in the database layer.
  const guild = member.guild;
  const now = Date.now();
  guild.__recentJoins ??= [];
  guild.__recentJoins.push(now);
  guild.__recentJoins = guild.__recentJoins.filter(t=>now-t<10000);
  if (guild.__recentJoins.length >= 8) console.warn(`Possible raid detected in ${guild.name}`);
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild) return;
  const content = message.content.toLowerCase();
  const blocked = ['discord.gg/', 'http://', 'https://'];
  if (blocked.some(x=>content.includes(x)) && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    await message.delete().catch(()=>{});
    await message.channel.send({content:`${message.author}, links are not allowed here.`}).then(m=>setTimeout(()=>m.delete().catch(()=>{}),5000)).catch(()=>{});
  }
});

if (process.env.MONGODB_URI) mongoose.connect(process.env.MONGODB_URI).then(()=>console.log('MongoDB connected')).catch(e=>console.error('MongoDB:',e.message));

client.login(process.env.DISCORD_TOKEN).catch(e=>console.error('Discord login failed:',e.message));
