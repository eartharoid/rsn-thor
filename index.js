require('dotenv').config();

const servers = process.env.SERVERS.replace(/\s/g, '').split(/,/g);
const ignore = new Set();

const Logger = require('leekslazylogger');
const {
	ConsoleTransport,
	FileTransport
} = require('leekslazylogger/dist/transports');
const log = new Logger({
	transports: [
		new ConsoleTransport(),
		new FileTransport({
			format: '[{timestamp}] [{LEVEL}] [{file}:{line}:{column}] {content}',
			name: 'RsN / Global Moderation'
		})
	]
});

const {
	Client: DiscordClient,
	Intents
} = require('discord.js');

class Bot extends DiscordClient {
	constructor() {
		super({
			intents: [
				Intents.FLAGS.GUILD_BANS,
				Intents.FLAGS.GUILD_MEMBERS,
				Intents.FLAGS.GUILDS
			],
			presence: { status: 'dnd' }
		});

		this.once('ready', () => {
			log.success(`Connected to Discord as "${this.user.tag}"`);
			if (this.guilds.cache.size !== servers.length) log.warn(`Currently in ${this.guilds.cache.size} guilds, but only ${servers.length} are registered in the environment`);
		});

		this.on('guildBanAdd', async ban => {
			if (!servers.includes(ban.guild.id)) return; // ignore foreign guilds
			if (ignore.has(ban.user.id)) return; // prevent cascading
			ignore.add(ban.user.id);
			log.info(`Ban added in "${ban.guild.name}", syncing...`);
			for (const server of servers.filter(id => id !== ban.guild.id)) {
				const guild = this.guilds.cache.get(server);
				if (!guild?.available) return log.warn(`Guild "${guild?.name}" is unavailable`);
				try {
					const member = guild.members.cache.get(ban.user.id);
					if (member && !member.bannable) return log.warn(`Can't ban "${ban.user.username}#${ban.user.discriminator}" from ${guild.name}`); // permission check
					await guild.bans.create(ban.user.id, {
						days: 1,
						reason: `[SYNC] Relayed ban from \`${ban.guild.name}\` - check the origin server's audit log or ban list for details.${ban.reason ? `\n\n\`${ban.reason}\`` : ''}`
					}); // ban
					log.info(`Banned "${ban.user.username}#${ban.user.discriminator}" from "${guild.name}"`);
				} catch (error) {
					log.error(`Failed to ban "${ban.user.username}#${ban.user.discriminator}" from "${guild.name}":\n${error}`);
				}
			}
			ignore.delete(ban.user.id);
		});

		this.on('guildBanRemove', async ban => {
			if (!servers.includes(ban.guild.id)) return; // ignore foreign guilds
			if (ignore.has(ban.user.id)) return; // prevent cascading
			ignore.add(ban.user.id);
			log.info(`Ban removed in "${ban.guild.name}", syncing...`);
			for (const server of servers.filter(id => id !== ban.guild.id)) {
				const guild = this.guilds.cache.get(server);
				if (!guild?.available) return log.warn(`Guild "${guild?.name}" is unavailable`);
				try {
					await guild.bans.remove(ban.user.id);
					log.info(`Unbanned "${ban.user.username}#${ban.user.discriminator}" from "${guild.name}"`);
				} catch (error) {
					log.error(`Failed to unban "${ban.user.username}#${ban.user.discriminator}" from "${guild.name}":\n${error}`);
				}
			}
			ignore.delete(ban.user.id);
		});

		this.on('guildMemberUpdate', async (old_member, new_member) => {
			if (ignore.has(new_member.id)) return; // prevent cascading
			ignore.add(new_member.id);
			const mute = !old_member.isCommunicationDisabled() && new_member.isCommunicationDisabled();
			const unmute = old_member.isCommunicationDisabled() && !new_member.isCommunicationDisabled();
			if (mute || unmute) {
				log.info(`Time out ${mute ? 'added' : 'removed'} in ${new_member.guild.name}`);
				for (const server of servers.filter(id => id !== new_member.guild.id)) {
					const guild = this.guilds.cache.get(server);
					if (!guild?.available) return log.warn(`Guild "${guild?.name}" is unavailable`);
					try {
						const member = await guild.members.fetch(new_member.id);
						if (!member.moderatable) return log.warn(`Cannot moderate "${new_member.user.tag}"`);
						if (mute) { // has been muted
							await member.disableCommunicationUntil(new_member.communicationDisabledUntil, `[SYNC] Relayed mute from \`${new_member.guild.name}\` - check the origin server's audit log for details.`);
							log.info(`Muted "${new_member.user.tag}" in "${guild.name}"`);
						} else if (unmute) { // has been unmuted
							await member.disableCommunicationUntil(null, `[SYNC] Relayed unmute from \`${new_member.guild.name}\` - check the origin server's audit log for details.`);
							log.info(`Unmuted "${new_member.user.tag}" in "${guild.name}"`);
						}
					} catch (error) {
						log.error(`Failed to mute/unmute "${new_member.user.tag}" in "${guild.name}":\n${error}`);
					}
				}
			}
			ignore.delete(new_member.id);
		});

		this.login();
	}
}

new Bot();

process.on('unhandledRejection', error => {
	log.warn('An error was not caught');
	log.error(error);
});
