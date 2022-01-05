require('dotenv').config();

const servers = process.env.SERVERS.replace(/\s/g, '').split(/,/g);

const Logger = require('leekslazylogger');
const log = new Logger({ name: 'RsN / Global Moderation' });

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
			if (!servers.includes(ban.guild.id)) return;
			log.info(`Ban removed in "${ban.guild.name}", syncing...`);
			for (const server of servers.filter(id => id !== ban.guild.id)) {
				try {
					const guild = this.guilds.cache.get(server);
					if (!guild?.available) return log.warn(`Guild "${guild?.name}" is unavailable`);
					const member = guild.members.cache.get(ban.user.id);
					if (member && !member.bannable) return log.warn(`Can't ban "${ban.user.username}#${ban.user.discriminator}" from ${ban.guild.name}`);
					await member.ban({
						days: 1,
						reason: `[SYNC] Relayed ban from \`${ban.guild.name}\` - check the origin server's audit log or ban list for details.`
					});
					log.info(`Banned "${ban.user.username}#${ban.user.discriminator}" from "${ban.guild.name}"`);
				} catch (error) {
					log.error(`Failed to ban "${ban.user.username}#${ban.user.discriminator}" from "${ban.guild.name}":\n${error}`);
				}
			}
		});

		this.on('guildBanRemove', async ban => {
			if (!servers.includes(ban.guild.id)) return;
			log.info(`Ban added in "${ban.guild.name}", syncing...`);
			for (const server of servers.filter(id => id !== ban.guild.id)) {
				try {
					const guild = this.guilds.cache.get(server);
					if (!guild?.available) return log.warn(`Guild "${guild?.name}" is unavailable`);
					await guild.bans.remove(ban.user.id);
					log.info(`Unbanned "${ban.user.username}#${ban.user.discriminator}" from "${ban.guild.name}"`);
				} catch (error) {
					log.error(`Failed to unban "${ban.user.username}#${ban.user.discriminator}" from "${ban.guild.name}":\n${error}`);
				}
			}
		});

		this.on('guildMemberUpdate', async (_member, member) => {
			// member.moderatable
		});

		this.login();
	}
}

new Bot();

process.on('unhandledRejection', error => {
	log.warn('An error was not caught');
	log.error(error);
});
