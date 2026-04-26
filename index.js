require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers
  ],
  partials: ['Message', 'Channel', 'Reaction']
});

// Reaction Role Data
const reactionRoles = new Map();

// Data display role per embed (untuk build description)
const roleDisplayData = new Map(); // messageID -> [{emoji, roleName}]

// Welcome & Goodbye Channel Data
const welcomeChannels = new Map(); // guildID -> channelID
const goodbyeChannels = new Map(); // guildID -> channelID

client.once('ready', () => {
  console.log(`Bot online sebagai ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  // Skip jika pesan dari bot
  if (message.author.bot) return;

  // Moderasi Party Code Valorant
  const partyCodeChannelId = '1497224361357086893';
  const valorantPartyCodePattern = /\b[A-Z0-9]{6}\b/;

  // Detect party code Valorant
  if (valorantPartyCodePattern.test(message.content.toUpperCase())) {
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

      // Setup reaction role
      const key = `${messageId}-${emoji}`;
      reactionRoles.set(key, {
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId,
        emoji,
        roleId
      });

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
    message.reply(`✅ Channel goodbye berhasil di-set ke ${channel}!`);
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
});

// Event: Member Baru Join
client.on('guildMemberAdd', async member => {
  const welcomeChannelId = welcomeChannels.get(member.guild.id);

  if (welcomeChannelId) {
    try {
      const channel = await member.guild.channels.fetch(welcomeChannelId);
      if (channel) {
        const embed = {
          color: 0x57F287,
          title: '👋 Selamat Datang!',
          description: `Halo ${member.user}, selamat bergabung di **${member.guild.name}**!\n\nJangan lupa baca rules dan intro ya!`,
          thumbnail: { url: member.user.displayAvatarURL({ dynamic: true }) },
          footer: { text: `Member ke-${member.guild.memberCount}` },
          timestamp: new Date()
        };

        await channel.send({ content: `${member.user}`, embeds: [embed] });
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
          description: `**${member.user.tag}** telah meninggalkan server.\n\nSemoga kita bertemu lagi!`,
          thumbnail: { url: member.user.displayAvatarURL({ dynamic: true }) },
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

// Event: Saat user add reaction
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  const key = `${reaction.message.id}-${reaction.emoji.name}`;
  const data = reactionRoles.get(key);

  if (!data) return;

  try {
    const guild = await client.guilds.fetch(data.guildId);
    const member = await guild.members.fetch(user.id);
    const role = await guild.roles.fetch(data.roleId);

    await member.roles.add(role);
    console.log(`✅ ${user.tag} dapat role ${role.name}`);
  } catch (error) {
    console.error('Gagal add role:', error);
  }
});

// Event: Saat user remove reaction
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  const key = `${reaction.message.id}-${reaction.emoji.name}`;
  const data = reactionRoles.get(key);

  if (!data) return;

  try {
    const guild = await client.guilds.fetch(data.guildId);
    const member = await guild.members.fetch(user.id);
    const role = await guild.roles.fetch(data.roleId);

    await member.roles.remove(role);
    console.log(`❌ ${user.tag} kehilangan role ${role.name}`);
  } catch (error) {
    console.error('Gagal remove role:', error);
  }
});

client.login(process.env.TOKEN);

require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Bot online sebagai ${client.user.tag}`);
});

client.on('messageCreate', message => {
  if (message.content === '!ping') {
    message.reply('Pong dari Playzone!');
  }
});

client.login(process.env.TOKEN);
