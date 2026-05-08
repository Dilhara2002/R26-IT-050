import { useContext, useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";

import IconButton from "./IconButton";

import { UserContext } from "../../contexts/UserContext";

import axios from "../../utils/axios";
import getResourceUri from "../../utils/getResourceUri";

import "./Post.css";
import Confirm from "./Confirm";

function Post({ post }) {
    const postRef = useRef(null);
    const user = useContext(UserContext).userContext;

    const [isCommentOpen, setIsCommentOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [commentsCount, setCommentsCount] = useState(post.commentsCount || 0);
    const [likesCount, setLikesCount] = useState(post.likesCount || 0);
    const [userLiked, setUserLiked] = useState(post.userLiked || false);
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [editingCommentIndex, setEditingCommentIndex] = useState(null);
    const [commentText, setCommentText] = useState("");

    const toggleCommentSection = () => {
        setIsCommentOpen(!isCommentOpen);
    };

    useEffect(() => {
        if (isCommentOpen && postRef.current) {
            postRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
        }
    }, [isCommentOpen]);

    const resetCommentForm = () => {
        setEditingCommentId(null);
        setEditingCommentIndex(null);
        setCommentText("");
    };

    const createComment = (e) => {
        e.preventDefault();

        if (!commentText.trim()) {
            toast.error("Comment cannot be empty");
            return;
        }

        if (editingCommentId !== null) {
            saveEditedComment();
            return;
        }

        axios.post(`/posts/${post.postId}/comments`, {
            text: commentText
        }).then((res) => {
            if (res.status === 201) {
                toast.success("Comment added successfully");

                post.comments.push({
                    commentId: res.data.commentId,
                    userId: user.id,
                    userAvatar: user.avatar,
                    userName: user.name,
                    text: commentText,
                    createdAt: new Date().toISOString(),
                });

                setCommentsCount(prevCount => prevCount + 1);
                setCommentText("");
                postRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
            } else {
                toast.error(res.data.message || "Failed to add comment");
            }
        }).catch((err) => {
            console.error(err);
            toast.error(err.response?.data?.message || "An error occurred while adding the comment");
        });
    };

    const editComment = (comment, index) => {
        setEditingCommentId(comment.commentId);
        setEditingCommentIndex(index);
        setCommentText(comment.text);
    };

    const saveEditedComment = () => {
        if (!commentText.trim()) {
            toast.error("Comment cannot be empty");
            return;
        }

        axios.put(`/posts/${post.postId}/comments/${editingCommentId}`, {
            text: commentText
        }).then(res => {
            if (res.status === 200) {
                toast.success("Comment updated successfully");
                post.comments[editingCommentIndex].text = commentText;
                resetCommentForm();
            } else {
                toast.error(res.data.message || "Failed to update comment");
            }
        }).catch(err => {
            console.error(err);
            toast.error(err.response?.data?.message || "An error occurred while updating the comment");
        });
    };

    const deleteComment = (commentId, index) => {
        if (commentId === undefined) {
            toast.error("Comment ID is not defined");
            return;
        }

        if (confirmDelete && confirmDelete.commentId === commentId) {
            return;
        }

        setCommentsCount(prevCount => prevCount - 1);
        setConfirmDelete({ commentId, index });
    };

    const toggleLike = () => {
        const endpoint = `/posts/${post.postId}/likes`;
        const action = userLiked ? axios.delete : axios.post;

        action(endpoint)
            .then((res) => {
                if (res.status === 200 || res.status === 201) {
                    setUserLiked(!userLiked);
                    setLikesCount(prev => prev + (userLiked ? -1 : 1));
                    toast.success(userLiked ? "Like removed successfully" : "Post liked successfully");
                } else {
                    toast.error(res.data.message || "Failed to update like status");
                }
            })
            .catch((err) => {
                console.error(err);
                toast.error(err.response?.data?.message || "An error occurred while updating like status");
            });
    };

    return (
        <div className="post" ref={postRef}>
            <div className="post__header">
                <div className="post__poster-avatar avatar">
                    <img src={getResourceUri(post.userAvatar)} alt="User" />
                </div>
                <div className="post__info">
                    <div className="post__poster-name">{post.userName}</div>
                    <div className="post__timestamp">{new Date(post.createdAt).toDateString()}</div>
                </div>
            </div>
            <div className="post__text">{post.text}</div>
            <div className={`post__contents content-grid--${post.contents.length}`}>
                {post.contents.map((content, index) => (
                    <div className="post__content" key={`post-${post.id}-content-${index}`}>
                        {content.type === "video" ? (
                            <video src={getResourceUri(content.path)} controls />
                        ) : (
                            <img src={getResourceUri(content.path)} alt={`Content ${index}`} />
                        )}
                    </div>
                ))}
            </div>
            <div className="post__actions">
                <div className="post__action-container">
                    <IconButton iconb="thumb_up" extraClass="minimal" content="Like" bg={userLiked? "green":""} c={userLiked? "white": ""} onClick={()=>toggleLike()}/>
                    <div className="post__action-count">{likesCount}</div>
                </div>
                <div className="post__action-container">
                    <IconButton iconb="comment" extraClass="minimal" content="Comment" onClick={toggleCommentSection} />
                    <div className="post__action-count">{commentsCount}</div>
                </div>
            </div>

            {isCommentOpen &&
                <>
                    <div className="post__comments">
                        {post.comments.map((comment, index) => (
                            <div className="post__comment" key={`post-${post.id}-comment-${index}`}>
                                <div className="post__commenter-avatar avatar">
                                    <img src={getResourceUri(comment.userAvatar)} alt="User" />
                                </div>
                                <div className="post__comment-content">
                                    <div className="post__commenter-name">{comment.userName}</div>
                                    <div className="post__comment-text">{comment.text}</div>
                                    <div className="post__comment-bottom">
                                        <div className="post__comment-timestamp">{new Date(comment.createdAt).toDateString()}</div>
                                    </div>
                                </div>
                                {user.id === comment.userId && (
                                    <div className="post__comment-actions">
                                        <IconButton iconb="edit" extraClass="minimal" c="blue" onClick={() => editComment(comment, index)} />
                                        <IconButton iconb="delete" extraClass="minimal" c="red" onClick={() => deleteComment(comment.commentId, index)} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="post__comments post__comments--add">
                        <div className="post__comment">
                            <div className="post__commenter-avatar avatar">
                                <img src={getResourceUri(user.avatar)} alt="User" />
                            </div>
                            <form className="post__comment-content--add" onSubmit={createComment}>
                                <input type="hidden" name="postId" value={post.postId} />
                                <textarea
                                    name="comment"
                                    className="post__comment-input"
                                    placeholder="Write a comment..."
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                />
                                {editingCommentId !== null ? (
                                    <div className="post__comment-actions">
                                        <IconButton iconb="close" extraClass="minimal" c="red" onClick={resetCommentForm} />

                                        <IconButton iconb="check" extraClass="minimal" c="green" />
                                    </div>
                                ) : (
                                    <IconButton iconb="send" extraClass="minimal" />
                                )}
                            </form>
                        </div>
                    </div>
                </>
            }

            {confirmDelete && (
                <Confirm
                    title="Delete Comment"
                    message="Are you sure you want to delete this comment?"
                    confirmText="Delete"
                    cancelText="Cancel"
                    onOK={() => {
                        axios
                            .delete(`/posts/${post.postId}/comments/${confirmDelete.commentId}`)
                            .then((res) => {
                                if (res.status === 200) {
                                    toast.success("Comment deleted successfully");
                                    post.comments.splice(confirmDelete.index, 1);
                                    setConfirmDelete(null);
                                } else {
                                    toast.error(res.data.message || "Failed to delete comment");
                                }
                            })
                            .catch((err) => {
                                console.error(err);
                                toast.error(err.response?.data?.message || "An error occurred while deleting the comment");
                            });
                    }}
                    onCancel={() => {
                        toast.info("Comment deletion cancelled");
                        setConfirmDelete(null);
                    }}
                />
            )}
        </div>
    );
}

export default Post;
