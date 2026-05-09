import { View, Text, Image, StyleSheet } from "react-native";
import IconButton from "./IconButton";

function Post({ post }) {
  return (
    <View style={styles.post}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          {post.userAvatar ? (
            <Image source={{ uri: post.userAvatar }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarIcon}>🌴</Text>
          )}
        </View>

        <View style={styles.info}>
          <Text style={styles.posterName}>{post.userName}</Text>
          <Text style={styles.timestamp}>{post.createdAt}</Text>
        </View>
      </View>

      <Text style={styles.text}>{post.text}</Text>

      {post.contents?.length > 0 ? (
        <View style={styles.contents}>
          {post.contents.map((content, index) => (
            <Image
              key={index}
              source={{ uri: content.path }}
              style={styles.contentImage}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <View style={styles.actionContainer}>
          <IconButton
            iconb="👍"
            content="Like"
            extraClass="minimal"
            c="#64748B"
            h={34}
            w={90}
          />
          <Text style={styles.actionCount}>{post.likesCount || 0}</Text>
        </View>

        <View style={styles.actionContainer}>
          <IconButton
            iconb="💬"
            content="Comment"
            extraClass="minimal"
            c="#64748B"
            h={34}
            w={120}
          />
          <Text style={styles.actionCount}>{post.commentsCount || 0}</Text>
        </View>
      </View>
    </View>
  );
}

export default Post;

const styles = StyleSheet.create({
  post: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 18,
    overflow: "hidden",
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#DBEAFE",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 21,
  },
  avatarIcon: {
    fontSize: 22,
  },
  info: {
    flexDirection: "column",
  },
  posterName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  timestamp: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  text: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    fontSize: 14,
    lineHeight: 21,
    color: "#334155",
  },
  contents: {
    width: "100%",
  },
  contentImage: {
    width: "100%",
    height: 190,
  },
  actions: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    gap: 12,
  },
  actionContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingRight: 8,
  },
  actionCount: {
    color: "#64748B",
    fontSize: 13,
  },
});