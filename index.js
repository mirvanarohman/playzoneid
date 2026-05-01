require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: ['Message', 'Channel', 'Reaction']
});

// Config file path
const configPath = './botconfig.json';

// Load config dari file
let config = {
  reactionRoles: {},
  roleDisplayData: {},
  welcomeChannels: {},
  goodbyeChannels: {},
  autoRoles: {},
  tempVoiceChannels: {} // channelID -> { creatorID, categoryID, roleID }
};

if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.log('Gagal load config, menggunakan config default');
  }
}

// Convert ke Map untuk penggunaan di bot
const reactionRoles = new Map(Object.entries(config.reactionRoles || {}).map(([k, v]) => [k, v]));
const roleDisplayData = new Map(Object.entries(config.roleDisplayData || {}).map(([k, v]) => [k, v]));
const welcomeChannels = new Map(Object.entries(config.welcomeChannels || {}));
const goodbyeChannels = new Map(Object.entries(config.goodbyeChannels || {}));
const autoRoles = new Map(Object.entries(config.autoRoles || {}));
const tempVoiceChannels = new Map(Object.entries(config.tempVoiceChannels || {}));

// Fungsi save config ke file
function saveConfig() {
  const configToSave = {
    reactionRoles: Object.fromEntries(reactionRoles),
    roleDisplayData: Object.fromEntries(roleDisplayData),
    welcomeChannels: Object.fromEntries(welcomeChannels),
    goodbyeChannels: Object.fromEntries(goodbyeChannels),
    autoRoles: Object.fromEntries(autoRoles),
    tempVoiceChannels: Object.fromEntries(tempVoiceChannels)
  };
  fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2));
}

client.once('ready', () => {
  console.log(`Bot online sebagai ${client.user.tag}`);
  console.log(`Config loaded dari ${configPath}`);
});

// Fungsi untuk normalisasi emoji identifier agar konsisten dengan raw events
function normalizeEmojiIdentifier(emoji) {
  // Cek apakah custom emoji format: <:name:id> atau <a:name:id>
  const customEmojiMatch = emoji.match(/^<(a)?:\w+:(\d+)>$/);

  if (customEmojiMatch) {
    // Custom emoji - gunakan ID
    return customEmojiMatch[2];
  }

  // Standard emoji - gunakan unicode langsung
  return emoji;
}

// Fungsi untuk mendapatkan emoji identifier dari raw event data
function getEmojiIdentifierFromRaw(emojiData) {
  return emojiData.id || emojiData.name;
}

// Interface channel data (untuk tombol manage)
const interfaceChannels = new Map(); // messageID -> channelID

client.on('messageCreate', async message => {
  // Skip jika pesan dari bot
  if (message.author.bot) return;

  // Command !help
  if (message.content === '!help') {
    const helpEmbed = {
      color: 0x5865F2,
      title: '📋 Bot Commands',
      description: 'Daftar semua command yang tersedia:',
      fields: [
        { name: '🎮 Reaction Role', value: '`!sendrolesembed` - Kirim embed role\n`!addroleembed <msgID> <emoji> <roleID> <roleName>` - Tambah role\n`!removerolembed <msgID> <emoji>` - Hapus role\n`!list` - Lihat semua role', inline: false },
        { name: '👋 Welcome & Goodbye', value: '`!setwelcome <channelID>` - Set welcome channel\n`!setgoodbye <channelID>` - Set goodbye channel\n`!setautorole <roleID>` - Set auto role member baru', inline: false },
        { name: '🎤 Temp Voice', value: '`!createtempvoice <categoryID> <roleID>` - Buat channel create temp voice\n`!deletetempvoice <channelID>` - Hapus channel create temp voice\n`!templist` - Lihat semua temp voice', inline: false },
        { name: '🎛️ Voice Interface', value: '`!interface <channelID>` - Kirim interface manage voice (lock/unlock/hide/show/rename/limit)', inline: false },
        { name: '📜 Server Rules', value: '`!sendrules` - Kirim embed server rules', inline: false },
        { name: '📢 Announcement', value: '`!announcement <channelID> <pesan>` - Kirim announcement + @everyone', inline: false },
        { name: '⚙️ Config', value: '`!config` - Lihat semua config bot', inline: false },
        { name: '🏓 Utilities', value: '`!ping` - Test bot', inline: false }
      ],
      footer: { text: '💾 Semua config tersimpan otomatis!' },
      timestamp: new Date()
    };

    message.reply({ embeds: [helpEmbed] });
  }

  // Moderasi Party Code Valorant
  const partyCodeChannelId = '1497224361357086893';
  // Pattern: 6 karakter alphanumeric, harus mengandung minimal 1 huruf dan 1 angka, case-insensitive
  // Menggunakan word boundary agar tidak match bagian dari string yang lebih panjang
  const valorantPartyCodePattern = /\b(?=(?:[A-Za-z0-9]{0,5}[A-Za-z])(?:[A-Za-z0-9]{0,5}[0-9]))[A-Za-z0-9]{6}\b/;

  // Detect party code Valorant
  if (valorantPartyCodePattern.test(message.content)) {
    // Jika dikirim di channel yang salah
    if (message.channelId !== partyCodeChannelId) {
      // Hapus pesan
      await message.delete();

      // Kirim pesan warning
      await message.channel.send({
        content: `❌ Mohon maaf, kirim party code Valorant di <#${partyCodeChannelId}> saja!`,
        allowedMentions: { parse: [] }
      });

      return; // Stop processing pesan ini
    }
  }

  // Anti-Raid Invite (Auto-Kick)
  const invitePatterns = [
    /discord\.gg\/[a-zA-Z0-9]+/g,
    /discord\.com\/invite\/[a-zA-Z0-9]+/g,
    /discord\.me\/[a-zA-Z0-9]+/g,
    /invite\.gg\/[a-zA-Z0-9]+/g,
    /discord\.io\/[a-zA-Z0-9]+/g,
    /dsc\.gg\/[a-zA-Z0-9]+/g,
    /discord\.li\/[a-zA-Z0-9]+/g
  ];

  let hasInvite = false;
  for (const pattern of invitePatterns) {
    if (pattern.test(message.content)) {
      hasInvite = true;
      break;
    }
  }

  if (hasInvite) {
    try {
      // Hapus pesan invite
      await message.delete();

      // Kick member yang kirim invite
      await message.member.kick('Mengirim raid invite server lain');

      // Kirim notifikasi ke channel
      await message.channel.send({
        content: `⚠️ ${message.author.tag} telah di-kick karena mengirim raid invite server lain!`
      });

      console.log(`⚠️ ${message.author.tag} di-kick: Mengirim raid invite`);

    } catch (error) {
      console.error('Gagal kick member:', error);

      // Kalau gagal kick (misal admin), minimal hapus pesan
      try {
        await message.delete();
        await message.channel.send({
          content: `❌ Pesan raid invite dihapus!`
        });
      } catch (e) {
        console.error('Gagal hapus pesan:', e);
      }
    }

    return; // Stop processing pesan ini
  }

  // Command !ping
  if (message.content === '!ping') {
    message.reply('Pong dari Playzone!');
  }

  // Kirim embed awal (kosong)
  if (message.content === '!sendrolesembed') {
    if (!message.member.permissions.has('ManageRoles')) {
      return message.reply('❌ Kamu tidak punya permission ManageRoles!');
    }

    const embed = {
      color: 0x5865F2,
      description: '👋 Pilih emoji sesuai game yang kamu mainkan untuk membuka pesan komunitas\n\n```Belum ada role yang tersedia```',
      timestamp: new Date()
    };

    const sentMessage = await message.channel.send({ embeds: [embed] });

    // Inisialisasi data display untuk message ini
    roleDisplayData.set(sentMessage.id, []);

    // Save config
    saveConfig();

    message.reply('✅ Embed terkirim! Sekarang pakai `!addroleembed <messageID> <emoji> <roleID> <roleName>` untuk tambah role.');
  }

  // Tambah role ke embed
  if (message.content.startsWith('!addroleembed ')) {
    if (!message.member.permissions.has('ManageRoles')) {
      return message.reply('❌ Kamu tidak punya permission ManageRoles!');
    }

    const args = message.content.slice(13).trim().split(/\s+/);
    if (args.length < 4) {
      return message.reply('❌ Format: `!addroleembed <messageID> <emoji> <roleID> <roleName>`\n\nContoh: `!addroleembed 1234567890 🎮 9876543210 Valorant`');
    }

    const messageId = args[0];
    const emoji = args[1];
    const roleId = args[2];
    const roleName = args.slice(3).join(' '); // untuk nama role yang ada spasi

    try {
      const targetMessage = await message.channel.messages.fetch(messageId);
      const role = message.guild.roles.cache.get(roleId);

      if (!role) {
        return message.reply('❌ Role tidak ditemukan!');
      }

      // Ambil embed yang sudah ada
      const oldEmbed = targetMessage.embeds[0];
      if (!oldEmbed) {
        return message.reply('❌ Pesan tersebut bukan embed role!');
      }

      // Ambil data display yang sudah ada
      let displayList = roleDisplayData.get(messageId) || [];

      // Tambah role baru ke list
      displayList.push({ emoji, roleName });
      roleDisplayData.set(messageId, displayList);

      // Build description baru
      const roleListText = displayList.map(item => `${item.emoji} - **${item.roleName}**`).join('\n');
      const newDescription = `👋 Pilih emoji sesuai game yang kamu mainkan untuk membuka pesan komunitas\n\n${roleListText}`;

      // Buat embed baru
      const newEmbed = {
        color: oldEmbed.color,
        description: newDescription,
        timestamp: new Date()
      };

      // Edit pesan dengan embed baru
      await targetMessage.edit({ embeds: [newEmbed] });

      // React emoji
      await targetMessage.react(emoji);

      // Normalisasi emoji identifier agar konsisten dengan raw events
      const normalizedEmoji = normalizeEmojiIdentifier(emoji);

      // Setup reaction role
      const key = `${messageId}-${normalizedEmoji}`;

      // Cek apakah reaction role sudah ada
      if (reactionRoles.has(key)) {
        return message.reply('⚠️ Reaction role dengan emoji tersebut sudah ada untuk message ini! Gunakan emoji lain atau hapus dulu yang lama.');
      }

      reactionRoles.set(key, {
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId,
        emoji: normalizedEmoji, // Simpan yang sudah dinormalisasi
        roleId
      });

      // Save config
      saveConfig();

      message.reply(`✅ Role **${roleName}** berhasil ditambahkan!\n🎮 Emoji: ${emoji}\n🏷️ Role: ${role.name}`);

    } catch (error) {
      console.error(error);
      message.reply('❌ Gagal tambah role! Pastikan message ID benar.');
    }
  }

  // Hapus role dari embed
  if (message.content.startsWith('!removerolembed ')) {
    if (!message.member.permissions.has('ManageRoles')) {
      return message.reply('❌ Kamu tidak punya permission ManageRoles!');
    }

    const args = message.content.slice(15).trim().split(/\s+/);
    if (args.length !== 2) {
      return message.reply('❌ Format: `!removerolembed <messageID> <emoji>`');
    }

    const [messageId, emoji] = args;
    const key = `${messageId}-${emoji}`;

    if (!reactionRoles.has(key)) {
      return message.reply('❌ Reaction role tersebut tidak ditemukan!');
    }

    try {
      // Hapus dari data bot
      reactionRoles.delete(key);

      // Fetch pesan embed
      const targetMessage = await message.channel.messages.fetch(messageId);
      const oldEmbed = targetMessage.embeds[0];

      if (oldEmbed) {
        // Ambil data display dan hapus role
        let displayList = roleDisplayData.get(messageId) || [];
        displayList = displayList.filter(item => item.emoji !== emoji);
        roleDisplayData.set(messageId, displayList);

        // Build description baru
        let newDescription;
        if (displayList.length > 0) {
          const roleListText = displayList.map(item => `${item.emoji} - **${item.roleName}**`).join('\n');
          newDescription = `👋 Pilih emoji sesuai game yang kamu mainkan untuk membuka pesan komunitas\n\n${roleListText}`;
        } else {
          newDescription = `👋 Pilih emoji sesuai game yang kamu mainkan untuk membuka pesan komunitas\n\n\`\`\`Belum ada role yang tersedia\`\`\``;
        }

        // Buat embed baru
        const newEmbed = {
          color: oldEmbed.color,
          description: newDescription,
          timestamp: new Date()
        };

        // Edit embed
        await targetMessage.edit({ embeds: [newEmbed] });
      }

      // Hapus emoji dari pesan
      await targetMessage.reactions.resolve(emoji).remove();

      // Save config
      saveConfig();

      message.reply(`✅ Role dengan emoji ${emoji} berhasil dihapus!`);

    } catch (error) {
      console.error(error);
      message.reply('❌ Gagal menghapus role!');
    }
  }

  // List semua reaction roles
  if (message.content === '!list') {
    if (reactionRoles.size === 0) {
      return message.reply('❌ Belum ada reaction role yang di-setup.');
    }

    let list = '📋 **Daftar Reaction Roles:**\n\n';
    for (const [key, data] of reactionRoles) {
      const role = message.guild.roles.cache.get(data.roleId);
      list += `📍 Message: \`${data.messageId}\` | ${data.emoji} → ${role?.name || data.roleId}\n`;
    }
    message.reply(list);
  }

  // Set Welcome Channel
  if (message.content.startsWith('!setwelcome ')) {
    if (!message.member.permissions.has('ManageChannels')) {
      return message.reply('❌ Kamu tidak punya permission ManageChannels!');
    }

    const channelId = message.content.slice(12).trim();

    // Cek channel ada atau tidak
    const channel = message.guild.channels.cache.get(channelId);
    if (!channel || channel.type !== 0) { // 0 = GUILD_TEXT
      return message.reply('❌ Channel tidak ditemukan atau bukan text channel!');
    }

    welcomeChannels.set(message.guild.id, channelId);
    saveConfig();
    message.reply(`✅ Channel welcome berhasil di-set ke ${channel}!`);
  }

  // Set Goodbye Channel
  if (message.content.startsWith('!setgoodbye ')) {
    if (!message.member.permissions.has('ManageChannels')) {
      return message.reply('❌ Kamu tidak punya permission ManageChannels!');
    }

    const channelId = message.content.slice(11).trim();

    // Cek channel ada atau tidak
    const channel = message.guild.channels.cache.get(channelId);
    if (!channel || channel.type !== 0) { // 0 = GUILD_TEXT
      return message.reply('❌ Channel tidak ditemukan atau bukan text channel!');
    }

    goodbyeChannels.set(message.guild.id, channelId);
    saveConfig();
    message.reply(`✅ Channel goodbye berhasil di-set ke ${channel}!`);
  }

  // Set Auto Role (member baru otomatis dapat role)
  if (message.content.startsWith('!setautorole ')) {
    if (!message.member.permissions.has('ManageRoles')) {
      return message.reply('❌ Kamu tidak punya permission ManageRoles!');
    }

    const roleId = message.content.slice(12).trim();
    const role = message.guild.roles.cache.get(roleId);

    if (!role) {
      return message.reply('❌ Role tidak ditemukan!');
    }

    autoRoles.set(message.guild.id, roleId);
    saveConfig();
    message.reply(`✅ Auto role berhasil di-set! Member baru akan otomatis mendapatkan role ${role.name}`);
  }

  // Lihat semua config
  if (message.content === '!config') {
    if (!message.member.permissions.has('ManageRoles')) {
      return message.reply('❌ Kamu tidak punya permission ManageRoles!');
    }

    const welcomeCh = welcomeChannels.get(message.guild.id);
    const goodbyeCh = goodbyeChannels.get(message.guild.id);
    const autoRole = autoRoles.get(message.guild.id);

    let configText = '📋 **Bot Config:**\n\n';

    if (welcomeCh) {
      const ch = message.guild.channels.cache.get(welcomeCh);
      configText += `📥 Welcome Channel: ${ch ? ch.name : welcomeCh}\n`;
    } else {
      configText += `📥 Welcome Channel: ❌ Belum di-set\n`;
    }

    if (goodbyeCh) {
      const ch = message.guild.channels.cache.get(goodbyeCh);
      configText += `📤 Goodbye Channel: ${ch ? ch.name : goodbyeCh}\n`;
    } else {
      configText += `📤 Goodbye Channel: ❌ Belum di-set\n`;
    }

    if (autoRole) {
      const role = message.guild.roles.cache.get(autoRole);
      configText += `🤖 Auto Role: ${role ? role.name : autoRole}\n`;
    } else {
      configText += `🤖 Auto Role: ❌ Belum di-set\n`;
    }

    configText += `\n🎮 Reaction Roles: ${reactionRoles.size} role(s)`;
    configText += `\n🎤 Temp Voice Channels: ${tempVoiceChannels.size} channel(s)`;
    configText += `\n💾 Config tersimpan di: \`${configPath}\``;

    message.reply(configText);
  }

  // Kirim Embed Rules
  if (message.content === '!sendrules') {
    if (!message.member.permissions.has('ManageChannels')) {
      return message.reply('❌ Kamu tidak punya permission ManageChannels!');
    }

    const rulesEmbed = {
      color: 0x5865F2,
      title: '📜 Server Rules',
      description: 'Selamat datang! Harap baca dan patuhi peraturan agar suasana tetap nyaman untuk semua member.',
      fields: [
        { name: '1. Hormati Sesama Member', value: 'Dilarang toxic, menghina, rasis, atau menyerang pribadi.', inline: false },
        { name: '2. Dilarang Spam', value: 'Jangan flood, spam, atau kirim pesan berulang.', inline: false },
        { name: '3. Gunakan Channel Sesuai', value: 'Gunakan setiap channel sesuai fungsi yang telah ditentukan.', inline: false },
        { name: '4. Dilarang Konten NSFW', value: 'Konten dewasa atau tidak pantas tidak diperbolehkan.', inline: false },
        { name: '5. No Promosi Tanpa Izin', value: 'Dilarang promosi server, produk, atau sosial media tanpa izin admin.', inline: false },
        { name: '6. Jaga Bahasa', value: 'Gunakan bahasa yang sopan dan tidak menyinggung.', inline: false },
        { name: '7. Ikuti Arahan Staff', value: 'Hormati keputusan admin dan moderator.', inline: false },
        { name: '8. Dilarang Cheat / Exploit', value: 'Gunakan cara bermain yang fair dan sportif.', inline: false },
        { name: '9. Dilarang Share Konten Negatif', value: 'Hindari hoax, provokasi, atau konten merugikan.', inline: false },
        { name: '10. Jaga Kenyamanan Server', value: 'Jangan membuat keributan atau mengganggu member lain.', inline: false }
      ],
      footer: { text: '⚠️ Pelanggaran = Warn / Mute / Kick / Ban | Have fun & semoga betah!' },
      timestamp: new Date()
    };

    await message.channel.send({ embeds: [rulesEmbed] });
    message.reply('✅ Embed rules berhasil dikirim!');
  }

  // Kirim Announcement ke channel tertentu
  if (message.content.startsWith('!announcement ')) {
    if (!message.member.permissions.has('MentionEveryone')) {
      return message.reply('❌ Kamu tidak punya permission MentionEveryone!');
    }

    const args = message.content.slice(14).trim().split(/\s+/);
    if (args.length < 2) {
      return message.reply('❌ Format: `!announcement <channelID> <pesan>`\n\nContoh: `!announcement 1234567890 Maintenance jam 20:00`');
    }

    const channelId = args[0];
    const announcementText = args.slice(1).join(' ');

    try {
      const targetChannel = await message.guild.channels.fetch(channelId);

      if (!targetChannel || targetChannel.type !== 0) {
        return message.reply('❌ Channel tidak ditemukan atau bukan text channel!');
      }

      const announcementEmbed = {
        color: 0xFEE75C,
        title: '📢 Announcement',
        description: announcementText,
        footer: { text: `Dari: ${message.author.tag}` },
        timestamp: new Date()
      };

      await targetChannel.send({
        content: '@everyone',
        embeds: [announcementEmbed]
      });

      message.reply(`✅ Announcement berhasil dikirim ke ${targetChannel}!`);

    } catch (error) {
      console.error(error);
      message.reply('❌ Gagal kirim announcement! Pastikan channel ID benar.');
    }
  }

  // Create Temp Voice Channel
  if (message.content.startsWith('!createtempvoice ')) {
    if (!message.member.permissions.has('ManageChannels')) {
      return message.reply('❌ Kamu tidak punya permission ManageChannels!');
    }

    const args = message.content.slice(16).trim().split(/\s+/);
    if (args.length !== 3) {
      return message.reply('❌ Format: `!createtempvoice <categoryID> <roleID> <denyViewRoleID>`\n\nContoh: `!createtempvoice 1494684596074315850 1497258047146561769 1494684594266706062`');
    }

    const [categoryId, roleId, denyViewRoleId] = args;

    // Cek category
    const category = message.guild.channels.cache.get(categoryId);
    if (!category || category.type !== 4) { // 4 = GUILD_CATEGORY
      return message.reply('❌ Category tidak ditemukan!');
    }

    // Cek role Valorant
    const role = message.guild.roles.cache.get(roleId);
    if (!role) {
      return message.reply('❌ Role tidak ditemukan!');
    }

    // Cek role deny view
    const denyViewRole = message.guild.roles.cache.get(denyViewRoleId);
    if (!denyViewRole) {
      return message.reply('❌ Role deny view tidak ditemukan!');
    }

    // Buat channel voice "Create Voice"
    const voiceChannel = await message.guild.channels.create({
      name: '🎙️ Create Voice',
      type: 2, // GUILD_VOICE
      parent: categoryId,
      permissionOverwrites: [
        {
          id: role.id,
          allow: ['Connect', 'ViewChannel', 'Speak', 'Stream', 'UseVAD', 'PrioritySpeaker', 'RequestToSpeak']
        },
        {
          id: denyViewRole.id,
          deny: ['ViewChannel']
        }
      ]
    });

    // Simpan ke config
    tempVoiceChannels.set(voiceChannel.id, {
      type: 'creator',
      categoryId,
      roleId,
      denyViewRoleId
    });
    saveConfig();

    message.reply(`✅ Channel create temp voice berhasil dibuat: ${voiceChannel}!\n📍 Category: ${category.name}\n🎮 Role: ${role.name}\n🚫 Tidak Bisa Lihat: ${denyViewRole.name}`);
  }

  // Delete Temp Voice Channel
  if (message.content.startsWith('!deletetempvoice ')) {
    if (!message.member.permissions.has('ManageChannels')) {
      return message.reply('❌ Kamu tidak punya permission ManageChannels!');
    }

    const channelId = message.content.slice(17).trim();
    const channel = message.guild.channels.cache.get(channelId);

    if (!channel) {
      return message.reply('❌ Channel tidak ditemukan!');
    }

    await channel.delete();

    // Hapus dari config
    tempVoiceChannels.delete(channelId);
    saveConfig();

    message.reply('✅ Channel berhasil dihapus!');
  }

  // List Temp Voice Channels
  if (message.content === '!templist') {
    if (tempVoiceChannels.size === 0) {
      return message.reply('❌ Belum ada temp voice channel yang di-setup.');
    }

    let list = '🎤 **Temp Voice Channels:**\n\n';
    for (const [channelId, data] of tempVoiceChannels) {
      if (data.type === 'creator') {
        const channel = message.guild.channels.cache.get(channelId);
        list += `📌 ${channel ? channel.name : channelId} (Creator)\n`;
      } else {
        const channel = message.guild.channels.cache.get(channelId);
        const creator = await client.users.fetch(data.creatorId).catch(() => null);
        list += `🎙️ ${channel ? channel.name : channelId} (by ${creator ? creator.username : data.creatorId})\n`;
      }
    }
    message.reply(list);
  }

  // Kirim Interface Manage Voice
  if (message.content.startsWith('!interface ')) {
    const channelId = message.content.slice(10).trim();
    const targetChannel = message.guild.channels.cache.get(channelId);

    if (!targetChannel) {
      return message.reply('❌ Channel tidak ditemukan!');
    }

    if (targetChannel.type !== 2) { // 2 = GUILD_VOICE
      return message.reply('❌ Channel harus voice channel!');
    }

    // Cek apakah user punya akses ke channel ini
    if (!targetChannel.permissionsFor(message.member).has('Connect')) {
      return message.reply('❌ Kamu tidak punya akses ke channel ini!');
    }

    const embed = {
      color: 0x5865F2,
      title: '🎛️ Voice Channel Manager',
      description: `Kelola channel **${targetChannel.name}** dengan tombol di bawah:\n\n✅ Klik tombol untuk mengatur channel!`,
      fields: [
        { name: '🔒 Lock/Unlock', value: 'Kunci/buka channel (hanya yang punya role bisa join)', inline: true },
        { name: '👁️ Hide/Show', value: 'Sembunyikan/tampilkan channel', inline: true },
        { name: '👤 Limit', value: 'Set limit user', inline: true },
        { name: '✏️ Rename', value: 'Ganti nama channel', inline: true }
      ],
      footer: { text: 'Hanya pembuat channel yang bisa manage!' },
      timestamp: new Date()
    };

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`voice_lock_${channelId}`)
          .setLabel('🔒 Lock')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`voice_unlock_${channelId}`)
          .setLabel('🔓 Unlock')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`voice_hide_${channelId}`)
          .setLabel('👁️ Hide')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`voice_show_${channelId}`)
          .setLabel('👁️‍🗨️ Show')
          .setStyle(ButtonStyle.Success)
      );

    const row2 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`voice_limit_${channelId}`)
          .setLabel('👤 Limit User')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`voice_rename_${channelId}`)
          .setLabel('✏️ Rename')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`voice_delete_${channelId}`)
          .setLabel('🗑️ Delete')
          .setStyle(ButtonStyle.Danger)
      );

    const sentMessage = await message.channel.send({
      content: `<@${message.author.id}>`,
      embeds: [embed],
      components: [row, row2]
    });

    // Simpan interface channel
    interfaceChannels.set(sentMessage.id, channelId);

    // Hapus interface setelah 5 menit
    setTimeout(() => {
      sentMessage.delete().catch(() => {});
      interfaceChannels.delete(sentMessage.id);
    }, 5 * 60 * 1000);
  }
});

// Event: Member Baru Join
client.on('guildMemberAdd', async member => {
  const welcomeChannelId = welcomeChannels.get(member.guild.id);
  const autoRoleId = autoRoles.get(member.guild.id);

  // Beri auto role jika ada
  if (autoRoleId) {
    try {
      const role = await member.guild.roles.fetch(autoRoleId);
      if (role) {
        await member.roles.add(role);
        console.log(`✅ ${member.user.tag} dapat auto role ${role.name}`);
      }
    } catch (error) {
      console.error('Gagal beri auto role:', error);
    }
  }

  // Kirim welcome message jika channel di-set
  if (welcomeChannelId) {
    try {
      const channel = await member.guild.channels.fetch(welcomeChannelId);
      if (channel) {
        const embed = {
          color: 0x57F287,
          title: '👋 Selamat Datang!',
          description: `Halo ${member}, selamat bergabung di **${member.guild.name}**!\n\nJangan lupa baca <#1497220802796326972> dan semoga betah di Playzone ID`,
          thumbnail: { url: member.displayAvatarURL({ dynamic: true }) },
          footer: { text: `Member ke-${member.guild.memberCount}` },
          timestamp: new Date()
        };

        await channel.send({ content: `${member}`, embeds: [embed] });
      }
    } catch (error) {
      console.error('Gagal kirim welcome message:', error);
    }
  }
});

// Event: Member Leave/Kick
client.on('guildMemberRemove', async member => {
  const goodbyeChannelId = goodbyeChannels.get(member.guild.id);

  if (goodbyeChannelId) {
    try {
      const channel = await member.guild.channels.fetch(goodbyeChannelId);
      if (channel) {
        const embed = {
          color: 0xED4245,
          title: '👋 Sampai Jumpa!',
          description: `**${member.displayName}** telah meninggalkan server.\n\nSemoga kita bertemu lagi!`,
          thumbnail: { url: member.displayAvatarURL({ dynamic: true }) },
          footer: { text: `Member tersisa: ${member.guild.memberCount}` },
          timestamp: new Date()
        };

        await channel.send({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Gagal kirim goodbye message:', error);
    }
  }
});

// Raw Events untuk reaction role (lebih reliable untuk pesan lama)
client.on('raw', async packet => {
  // Hanya proses MESSAGE_REACTION_ADD dan MESSAGE_REACTION_REMOVE
  if (!['MESSAGE_REACTION_ADD', 'MESSAGE_REACTION_REMOVE'].includes(packet.t)) return;

  const { d: data } = packet;
  const messageId = data.message_id;
  const userId = data.user_id;

  // Gunakan fungsi yang sama untuk normalisasi emoji identifier
  const emojiIdentifier = getEmojiIdentifierFromRaw(data.emoji);

  // Buat key untuk mencari reaction role
  const key = `${messageId}-${emojiIdentifier}`;
  const roleData = reactionRoles.get(key);

  if (!roleData) {
    // Debug: log untuk mencari tahu kenapa tidak match
    console.log(`⚠️ Reaction role tidak ditemukan: ${key}`);
    return;
  }

  try {
    // Fetch guild, member, dan role
    const guild = await client.guilds.fetch(roleData.guildId);
    const member = await guild.members.fetch(userId);
    const role = await guild.roles.fetch(roleData.roleId);

    if (packet.t === 'MESSAGE_REACTION_ADD') {
      await member.roles.add(role);
      console.log(`✅ ${member.user.tag} dapat role ${role.name} (raw event: ${key})`);
    } else {
      await member.roles.remove(role);
      console.log(`❌ ${member.user.tag} kehilangan role ${role.name} (raw event: ${key})`);
    }
  } catch (error) {
    console.error('Gagal proses reaction role (raw):', error.message);
  }
});

// Event: Button Click (Voice Interface)
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const [action, channelId] = interaction.customId.split('_').slice(1);
  const channel = await interaction.guild.channels.fetch(channelId);

  if (!channel) {
    return interaction.reply({ content: '❌ Channel tidak ditemukan!', ephemeral: true });
  }

  // Cek apakah user adalah creator atau punya permission manage
  const tempData = tempVoiceChannels.get(channelId);
  const isCreator = tempData && tempData.creatorId === interaction.user.id;
  const hasPermission = interaction.member.permissions.has('ManageChannels');

  if (action === 'delete' && !isCreator && !hasPermission) {
    return interaction.reply({ content: '❌ Hanya pembuat channel yang bisa menghapus!', ephemeral: true });
  }

  switch (action) {
    case 'lock': {
      const everyoneRole = interaction.guild.roles.everyone;
      await channel.permissionOverwrites.edit(everyoneRole, { Connect: false });
      await interaction.reply({ content: `✅ Channel **${channel.name}** terkunci!`, ephemeral: true });
      break;
    }
    case 'unlock': {
      const everyoneRole = interaction.guild.roles.everyone;
      await channel.permissionOverwrites.edit(everyoneRole, { Connect: true });
      await interaction.reply({ content: `✅ Channel **${channel.name}** terbuka!`, ephemeral: true });
      break;
    }
    case 'hide': {
      const everyoneRole = interaction.guild.roles.everyone;
      await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: false });
      await interaction.reply({ content: `✅ Channel **${channel.name}** disembunyikan!`, ephemeral: true });
      break;
    }
    case 'show': {
      const everyoneRole = interaction.guild.roles.everyone;
      await channel.permissionOverwrites.edit(everyoneRole, { ViewChannel: true });
      await interaction.reply({ content: `✅ Channel **${channel.name}** ditampilkan!`, ephemeral: true });
      break;
    }
    case 'limit': {
      await interaction.reply({ content: '✏️ Masukkan limit user (angka 1-99):\n\nContoh: `5`', ephemeral: true });
      const filter = m => m.author.id === interaction.user.id && !isNaN(m.content) && parseInt(m.content) >= 1 && parseInt(m.content) <= 99;
      const collector = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });
      collector.on('collect', async m => {
        const limit = parseInt(m.content);
        await channel.setUserLimit(limit);
        await m.reply(`✅ Limit user di-set ke ${limit}`);
      });
      break;
    }
    case 'rename': {
      await interaction.reply({ content: '✏️ Masukkan nama baru:\n\nContoh: `Mabar Valorant`', ephemeral: true });
      const filter = m => m.author.id === interaction.user.id;
      const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });
      collector.on('collect', async m => {
        await channel.setName(m.content);
        await m.reply(`✅ Channel di-rename menjadi **${m.content}**`);
      });
      break;
    }
    case 'delete': {
      await channel.delete();
      tempVoiceChannels.delete(channelId);
      saveConfig();
      await interaction.reply({ content: `✅ Channel **${channel.name}** dihapus!`, ephemeral: true });
      break;
    }
  }
});

// Event: Voice State Update (Untuk create/delete temp voice)
client.on('voiceStateUpdate', async (oldState, newState) => {
  // Jika tidak ada perubahan channel
  if (oldState.channelId === newState.channelId) return;

  // Cek apakah user join ke creator channel
  if (newState.channelId) {
    const creatorData = tempVoiceChannels.get(newState.channelId);
    if (creatorData && creatorData.type === 'creator') {
      const category = await client.channels.fetch(creatorData.categoryId);
      const member = newState.member;
      const guild = newState.guild;

      // Fetch role yang diperlukan
      const roleID = creatorData.roleId;
      const denyViewRoleID = creatorData.denyViewRoleId;

      // Buat permission overwrites yang bersih (tidak menyalin dari creator)
      const permissionOverwrites = [];

      // 1. @everyone: Connect = false
      permissionOverwrites.push({
        id: guild.roles.everyone.id,
        deny: ['Connect']
      });

      // 2. roleID: ViewChannel, Connect, Speak = true (jika roleID ada)
      if (roleID) {
        permissionOverwrites.push({
          id: roleID,
          allow: ['ViewChannel', 'Connect', 'Speak', 'Stream', 'UseVAD', 'PrioritySpeaker']
        });
      }

      // 3. denyViewRoleID: ViewChannel = false (jika ada)
      if (denyViewRoleID) {
        permissionOverwrites.push({
          id: denyViewRoleID,
          deny: ['ViewChannel']
        });
      }

      // 4. Pembuat channel: full control
      permissionOverwrites.push({
        id: member.id,
        allow: ['Connect', 'ManageChannels', 'MoveMembers', 'MuteMembers', 'DeafenMembers', 'ViewChannel', 'Speak', 'Stream', 'UseVAD', 'PrioritySpeaker']
      });

      // Buat temp voice channel dengan permission yang sudah di-setup
      const tempChannel = await guild.channels.create({
        name: `${member.displayName}'s Voice`,
        type: 2, // GUILD_VOICE
        parent: category,
        permissionOverwrites: permissionOverwrites
      });

      // Pindahkan user ke temp channel
      await member.voice.setChannel(tempChannel);

      // Simpan data temp channel
      tempVoiceChannels.set(tempChannel.id, {
        type: 'temp',
        creatorId: member.id,
        categoryId: creatorData.categoryId,
        roleId: creatorData.roleId,
        denyViewRoleId: creatorData.denyViewRoleId
      });
      saveConfig();

      console.log(`✅ Temp voice dibuat: ${tempChannel.name} untuk ${member.displayName}`);
    }
  }

  // Cek apakah user meninggalkan temp voice channel
  if (oldState.channelId) {
    const tempData = tempVoiceChannels.get(oldState.channelId);
    if (tempData && tempData.type === 'temp') {
      const channel = await client.channels.fetch(oldState.channelId);

      // Cek apakah channel kosong
      if (channel.members.size === 0) {
        await channel.delete();
        tempVoiceChannels.delete(oldState.channelId);
        saveConfig();
        console.log(`🗑️ Temp voice dihapus: ${channel.name}`);
      } else {
        // Pindahkan ownership ke user lain yang masih ada
        const newOwner = channel.members.first();
        if (newOwner) {
          tempVoiceChannels.set(oldState.channelId, {
            type: 'temp',
            creatorId: newOwner.id,
            categoryId: tempData.categoryId,
            roleId: tempData.roleId
          });
          saveConfig();
        }
      }
    }
  }
});

client.login(process.env.TOKEN);
